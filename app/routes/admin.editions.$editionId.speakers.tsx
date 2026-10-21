import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.speakers";
import { pageTitle } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import {
  NotFoundError,
  ValidationError,
  getDataAccess,
  type SpeakerRole,
} from "~/lib/data-access";
import { SPEAKER_ROLES, speakerRoleLabel } from "~/lib/vocab";
import { RichEditor } from "~/components/rich-editor";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Invited speakers") }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const speakers = await da.invitedSpeakers.listForEdition(
    actor,
    params.editionId,
  );
  return { edition: { id: edition.id, name: edition.name }, speakers };
}

function parseRole(value: FormDataEntryValue | null): SpeakerRole | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return SPEAKER_ROLES.includes(raw as SpeakerRole)
    ? (raw as SpeakerRole)
    : null;
}

function parseSortOrder(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "0").trim() || "0";
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError("Sort order must be a whole number.");
  }
  return n;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await request.formData();
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

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

const smallButton =
  "rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

type Speaker = Route.ComponentProps["loaderData"]["speakers"][number];

function SpeakerFields({ speaker }: { speaker?: Speaker }) {
  const idBase = speaker ? speaker.id : "new";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label htmlFor={`name-${idBase}`} className="block text-sm font-medium">
          Name
        </label>
        <input
          id={`name-${idBase}`}
          name="name"
          type="text"
          required
          defaultValue={speaker?.name ?? ""}
          placeholder="Dr. Jane Rivera"
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label
          htmlFor={`affiliation-${idBase}`}
          className="block text-sm font-medium"
        >
          Affiliation
        </label>
        <input
          id={`affiliation-${idBase}`}
          name="affiliation"
          type="text"
          defaultValue={speaker?.affiliation ?? ""}
          placeholder="University of Texas at Austin"
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`role-${idBase}`} className="block text-sm font-medium">
          Role
        </label>
        <select
          id={`role-${idBase}`}
          name="role"
          defaultValue={speaker?.role ?? ""}
          className={inputClass}
        >
          <option value="">No role set</option>
          {SPEAKER_ROLES.map((role) => (
            <option key={role} value={role}>
              {speakerRoleLabel(role)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={`sort-${idBase}`} className="block text-sm font-medium">
          Sort order
        </label>
        <input
          id={`sort-${idBase}`}
          name="sortOrder"
          type="number"
          step="1"
          defaultValue={speaker?.sortOrder ?? 0}
          className={inputClass}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <label
          htmlFor={`talk-${idBase}`}
          className="block text-sm font-medium"
        >
          Talk title
        </label>
        <input
          id={`talk-${idBase}`}
          name="talkTitle"
          type="text"
          defaultValue={speaker?.talkTitle ?? ""}
          className={inputClass}
        />
      </div>
      <div className="sm:col-span-2">
        <RichEditor
          name="bio"
          label="Bio"
          mode="body"
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
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Invited speakers</h1>
        <p className="text-gray-700 dark:text-gray-300">
          {edition.name}.{" "}
          <Link
            to={`/admin/editions/${edition.id}`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Edit meeting
          </Link>
        </p>
        <p className="text-gray-600 dark:text-gray-400">
          Keynotes and award lectures for the meeting. Attach a speaker to a
          session on the{" "}
          <Link
            to={`/admin/editions/${edition.id}/program`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            program
          </Link>
          . Headshot upload comes later.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      {speakers.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          No invited speakers yet. Add the first below.
        </p>
      ) : (
        <ul className="space-y-4">
          {speakers.map((speaker) => (
            <li
              key={speaker.id}
              className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{speaker.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {[
                      speaker.role ? speakerRoleLabel(speaker.role) : "",
                      speaker.affiliation ?? "",
                    ]
                      .filter((p) => p.length > 0)
                      .join(" . ")}
                  </p>
                  {speaker.talkTitle ? (
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {speaker.talkTitle}
                    </p>
                  ) : null}
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
                    className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Remove
                  </button>
                </Form>
              </div>

              <details className="rounded border border-gray-100 p-3 dark:border-gray-900">
                <summary className="cursor-pointer text-sm font-medium">
                  Edit speaker
                </summary>
                <Form method="post" className="mt-3 space-y-3" noValidate>
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="speakerId" value={speaker.id} />
                  <SpeakerFields speaker={speaker} />
                  <button type="submit" disabled={submitting} className={smallButton}>
                    Save speaker
                  </button>
                </Form>
              </details>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-lg font-medium">Add a speaker</h2>
        <Form method="post" className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="create" />
          <SpeakerFields />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add speaker"}
          </button>
        </Form>
      </section>
    </div>
  );
}
