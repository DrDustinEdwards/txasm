import { Field, TextField } from "capsomer/react/field";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Panel } from "capsomer/react/panel";
import { Disclosure } from "capsomer/react/disclosure";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.speakers";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireChair, requireChairEdition } from "~/lib/auth.server";
import { NotFoundError, ValidationError, getDataAccess, type SpeakerRole } from "~/lib/data-access";
import { SPEAKER_ROLES, speakerRoleLabel } from "~/lib/vocab";
import { RichTextField } from "capsomer/react/rich-text-field";
import { BODY_TAGS } from "~/lib/richtext";
import { readForm } from "@dustinedwards/site-runtime/body";
import { parseSortOrder, FORM_LIMIT } from "~/lib/form.server";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";
// Capsomer styles only this page draws, loaded with it rather than on every page (app.css).
import "capsomer/toolbar.css";
import "capsomer/rich-text-field.css";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Invited speakers"));
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { actor, da, edition } = await requireChairEdition(request, params.editionId);
  const speakers = await da.invitedSpeakers.listForEdition(actor, params.editionId);
  return { edition, speakers };
}

function parseRole(value: FormDataEntryValue | null): SpeakerRole | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return SPEAKER_ROLES.includes(raw as SpeakerRole) ? (raw as SpeakerRole) : null;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await readForm(request, FORM_LIMIT);
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
    <div className="cap-grid" data-cols="2">
      <TextField
        id={`name-${idBase}`}
        label="Name"
        name="name"
        type="text"
        required
        defaultValue={speaker?.name ?? ""}
        placeholder="Dr. Jane Rivera"
      />
      <TextField
        id={`affiliation-${idBase}`}
        label="Affiliation"
        name="affiliation"
        type="text"
        defaultValue={speaker?.affiliation ?? ""}
        placeholder="University of Texas at Austin"
      />
      <Field label="Role" id={`role-${idBase}`}>
        <select name="role" defaultValue={speaker?.role ?? ""} className="cap-select">
          <option value="">No role set</option>
          {SPEAKER_ROLES.map((role) => (
            <option key={role} value={role}>
              {speakerRoleLabel(role)}
            </option>
          ))}
        </select>
      </Field>
      <TextField
        id={`sort-${idBase}`}
        label="Sort order"
        name="sortOrder"
        type="number"
        step="1"
        defaultValue={speaker?.sortOrder ?? 0}
      />
      <div className="span-2">
        <TextField
          id={`talk-${idBase}`}
          label="Talk title"
          name="talkTitle"
          type="text"
          defaultValue={speaker?.talkTitle ?? ""}
        />
      </div>
      <div className="span-2">
        <RichTextField
          name="bio"
          label="Bio"
          tags={BODY_TAGS}
          lines="multi"
          initialHTML={speaker?.bio ?? ""}
        />
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
    <div className="cap-stack" data-gap="7">
      <div className="cap-stack" data-gap="3">
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
        <ul className="cap-stack">
          {speakers.map((speaker) => (
            <li key={speaker.id} className="cap-panel">
              <div className="cap-panel-body cap-stack" data-gap="4">
                <div className="cap-spread">
                  <div>
                    <p className="strong">{speaker.name}</p>
                    <p className="small cap-muted">
                      {[
                        speaker.role ? speakerRoleLabel(speaker.role) : "",
                        speaker.affiliation ?? "",
                      ]
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
                      onClick={(e) =>
                        confirmSubmit(e, {
                          title: `Remove ${speaker.name}?`,
                          action: "Remove speaker",
                        })
                      }
                      className="small strong"
                    >
                      Remove
                    </button>
                  </Form>
                </div>

                <Disclosure summary="Edit speaker" variant="card" size="sm" marker="triangle">
                  <Form method="post" className="cap-stack" data-gap="4" noValidate>
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="speakerId" value={speaker.id} />
                    <SpeakerFields speaker={speaker} />
                    <button type="submit" disabled={submitting} className="cap-btn" data-size="sm">
                      Save speaker
                    </button>
                  </Form>
                </Disclosure>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Panel title="Add a speaker">
        <Form method="post" className="cap-stack" noValidate>
          <input type="hidden" name="intent" value="create" />
          <SpeakerFields />
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Adding..." : "Add speaker"}
          </button>
        </Form>
      </Panel>
    </div>
  );
}
