import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.speakers";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import { NotFoundError, ValidationError, getDataAccess, type SpeakerRole } from "~/lib/data-access";
import { SPEAKER_ROLES, speakerRoleLabel } from "~/lib/vocab";
import { RichEditor } from "~/components/rich-editor";
import { parseSortOrder, readForm } from "~/lib/form.server";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Invited speakers");
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const speakers = await da.invitedSpeakers.listForEdition(actor, params.editionId);
  return { edition: { id: edition.id, name: edition.name }, speakers };
}

function parseRole(value: FormDataEntryValue | null): SpeakerRole | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return SPEAKER_ROLES.includes(raw as SpeakerRole) ? (raw as SpeakerRole) : null;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await readForm(request);
  const intent = String(form.get("intent") ?? "");
  const back = `/admin/editions/${params.editionId}/speakers`;

  try {
    if (intent === "remove") {
      const id = String(form.get("speakerId") ?? "");
      if (id) await da.invitedSpeakers.remove(actor, id);
      return redirect(back);
    }

    if (intent === "create") {
      await da.invitedSpeakers.create(actor, {
        editionId: params.editionId,
        name: String(form.get("name") ?? ""),
        affiliation: String(form.get("affiliation") ?? ""),
        role: parseRole(form.get("role")),
        talkTitle: String(form.get("talkTitle") ?? ""),
        bio: String(form.get("bio") ?? ""),
        sortOrder: parseSortOrder(form.get("sortOrder")),
      });
      return redirect(back);
    }

    if (intent === "update") {
      await da.invitedSpeakers.update(actor, String(form.get("speakerId") ?? ""), {
        name: String(form.get("name") ?? ""),
        affiliation: String(form.get("affiliation") ?? ""),
        role: parseRole(form.get("role")),
        talkTitle: String(form.get("talkTitle") ?? ""),
        bio: String(form.get("bio") ?? ""),
        sortOrder: parseSortOrder(form.get("sortOrder")),
      });
      return redirect(back);
    }
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { error: error.message };
    }
    throw error;
  }

  return { error: "Unknown action." };
}

type Speaker = Route.ComponentProps["loaderData"]["speakers"][number];

function SpeakerFields({ speaker }: { speaker?: Speaker }) {
  const idBase = speaker ? speaker.id : "new";
  return (
    <div className="grid-2">
      <div className="stack-1">
        <label htmlFor={`name-${idBase}`} className="cap-field-label">
          Name
        </label>
        <input
          id={`name-${idBase}`}
          name="name"
          type="text"
          required
          defaultValue={speaker?.name ?? ""}
          placeholder="Dr. Jane Rivera"
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`affiliation-${idBase}`} className="cap-field-label">
          Affiliation
        </label>
        <input
          id={`affiliation-${idBase}`}
          name="affiliation"
          type="text"
          defaultValue={speaker?.affiliation ?? ""}
          placeholder="University of Texas at Austin"
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`role-${idBase}`} className="cap-field-label">
          Role
        </label>
        <select
          id={`role-${idBase}`}
          name="role"
          defaultValue={speaker?.role ?? ""}
          className="cap-select"
        >
          <option value="">No role set</option>
          {SPEAKER_ROLES.map((role) => (
            <option key={role} value={role}>
              {speakerRoleLabel(role)}
            </option>
          ))}
        </select>
      </div>
      <div className="stack-1">
        <label htmlFor={`sort-${idBase}`} className="cap-field-label">
          Sort order
        </label>
        <input
          id={`sort-${idBase}`}
          name="sortOrder"
          type="number"
          step="1"
          defaultValue={speaker?.sortOrder ?? 0}
          className="cap-input"
        />
      </div>
      <div className="stack-1 span-2">
        <label htmlFor={`talk-${idBase}`} className="cap-field-label">
          Talk title
        </label>
        <input
          id={`talk-${idBase}`}
          name="talkTitle"
          type="text"
          defaultValue={speaker?.talkTitle ?? ""}
          className="cap-input"
        />
      </div>
      <div className="span-2">
        <RichEditor name="bio" label="Bio" mode="body" initialHTML={speaker?.bio ?? ""} />
      </div>
    </div>
  );
}

export default function InvitedSpeakers({ loaderData }: Route.ComponentProps) {
  const { edition, speakers } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="stack-8">
      <div className="stack-2">
        <h1 className="page-title">Invited speakers</h1>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}`} className="strong">
            Edit meeting
          </Link>
        </p>
        <p className="cap-muted">
          Keynotes and award lectures for the meeting. Attach a speaker to a session on the{" "}
          <Link to={`/admin/editions/${edition.id}/program`} className="strong">
            program
          </Link>
          . Headshot upload comes later.
        </p>
      </div>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      {speakers.length === 0 ? (
        <p>No invited speakers yet. Add the first below.</p>
      ) : (
        <ul className="stack-4">
          {speakers.map((speaker) => (
            <li key={speaker.id} className="card stack-3">
              <div className="spread">
                <div>
                  <p className="strong">{speaker.name}</p>
                  <p className="small cap-muted">
                    {[speaker.role ? speakerRoleLabel(speaker.role) : "", speaker.affiliation ?? ""]
                      .filter((p) => p.length > 0)
                      .join(" . ")}
                  </p>
                  {speaker.talkTitle ? <p className="small">{speaker.talkTitle}</p> : null}
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="speakerId" value={speaker.id} />
                  <button
                    type="submit"
                    onClick={(e) => {
                      if (!window.confirm(`Remove ${speaker.name}?`)) {
                        e.preventDefault();
                      }
                    }}
                    className="small strong"
                  >
                    Remove
                  </button>
                </Form>
              </div>

              <details className="card card-s">
                <summary className="summary">Edit speaker</summary>
                <Form method="post" className="stack-3 mt-3" noValidate>
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="speakerId" value={speaker.id} />
                  <SpeakerFields speaker={speaker} />
                  <button type="submit" disabled={submitting} className="cap-btn" data-size="sm">
                    Save speaker
                  </button>
                </Form>
              </details>
            </li>
          ))}
        </ul>
      )}

      <section className="card stack-4">
        <h2 className="subsection-title">Add a speaker</h2>
        <Form method="post" className="stack-4" noValidate>
          <input type="hidden" name="intent" value="create" />
          <SpeakerFields />
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Adding..." : "Add speaker"}
          </button>
        </Form>
      </section>
    </div>
  );
}
