import { useEffect, useRef } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.program";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  NotFoundError,
  ValidationError,
  getDataAccess,
  type ProgramAbstractOption,
  type ProgramItemKind,
  type ProgramSessionResolved,
} from "~/lib/data-access";
import { formatDateTime, toDateTimeLocal } from "~/lib/format";
import { extractPlainText } from "~/lib/richtext";
import {
  PROGRAM_ITEM_KINDS,
  programKindLabel,
  speakerRoleLabel,
} from "~/lib/vocab";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Program | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const sessions = await da.programSessions.listForEdition(
    actor,
    params.editionId,
  );
  const unplaced = await da.programItems.listUnplacedAbstracts(
    actor,
    params.editionId,
  );
  const speakerRows = await da.invitedSpeakers.listForEdition(
    actor,
    params.editionId,
  );
  const speakers = speakerRows.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    talkTitle: s.talkTitle,
  }));
  return {
    edition: { id: edition.id, name: edition.name },
    sessions,
    unplaced,
    speakers,
  };
}

function parseKind(value: FormDataEntryValue | null): ProgramItemKind | undefined {
  const raw = String(value ?? "").trim();
  return raw ? (raw as ProgramItemKind) : undefined;
}

function parseWhen(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const editionId = params.editionId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "session-create") {
      await da.programSessions.create(actor, {
        editionId,
        title: String(form.get("title") ?? ""),
        sessionDate: parseWhen(form.get("sessionDate")),
        startsAt: parseWhen(form.get("startsAt")),
        endsAt: parseWhen(form.get("endsAt")),
        location: String(form.get("location") ?? ""),
      });
      return { ok: "Session added." };
    }

    if (intent === "session-update") {
      await da.programSessions.update(actor, String(form.get("sessionId") ?? ""), {
        title: String(form.get("title") ?? ""),
        sessionDate: parseWhen(form.get("sessionDate")),
        startsAt: parseWhen(form.get("startsAt")),
        endsAt: parseWhen(form.get("endsAt")),
        location: String(form.get("location") ?? ""),
      });
      return { ok: "Session saved." };
    }

    if (intent === "session-delete") {
      await da.programSessions.remove(actor, String(form.get("sessionId") ?? ""));
      return { ok: "Session removed." };
    }

    if (intent === "session-move") {
      const sessionId = String(form.get("sessionId") ?? "");
      const direction = String(form.get("direction") ?? "");
      const sessions = await da.programSessions.listForEdition(actor, editionId);
      const ids = sessions.map((s) => s.id);
      const idx = ids.indexOf(sessionId);
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (idx !== -1 && swap >= 0 && swap < ids.length) {
        [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
        await da.programSessions.reorder(actor, editionId, ids);
      }
      return { ok: true };
    }

    if (intent === "item-add-abstract") {
      const abstractId = String(form.get("abstractId") ?? "");
      if (!abstractId) return { error: "Choose an abstract to add." };
      await da.programItems.addAbstract(actor, {
        sessionId: String(form.get("sessionId") ?? ""),
        abstractId,
        kind: parseKind(form.get("kind")),
      });
      return { ok: "Abstract added to the session." };
    }

    if (intent === "item-add-speaker") {
      const speakerId = String(form.get("speakerId") ?? "");
      if (!speakerId) return { error: "Choose a speaker to add." };
      await da.programItems.addSpeakerItem(actor, {
        sessionId: String(form.get("sessionId") ?? ""),
        speakerId,
        kind: parseKind(form.get("kind")),
      });
      return { ok: "Speaker added to the session." };
    }

    if (intent === "item-add-custom") {
      await da.programItems.addCustom(actor, {
        sessionId: String(form.get("sessionId") ?? ""),
        customTitle: String(form.get("customTitle") ?? ""),
        kind: parseKind(form.get("kind")),
        note: String(form.get("note") ?? ""),
        startsAt: parseWhen(form.get("startsAt")),
      });
      return { ok: "Item added to the session." };
    }

    if (intent === "item-update") {
      await da.programItems.update(actor, String(form.get("itemId") ?? ""), {
        kind: parseKind(form.get("kind")),
        customTitle: String(form.get("customTitle") ?? ""),
        note: String(form.get("note") ?? ""),
        startsAt: parseWhen(form.get("startsAt")),
      });
      return { ok: "Item saved." };
    }

    if (intent === "item-delete") {
      await da.programItems.remove(actor, String(form.get("itemId") ?? ""));
      return { ok: "Item removed." };
    }

    if (intent === "item-move") {
      const sessionId = String(form.get("sessionId") ?? "");
      const itemId = String(form.get("itemId") ?? "");
      const direction = String(form.get("direction") ?? "");
      const sessions = await da.programSessions.listForEdition(actor, editionId);
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        const ids = session.items.map((i) => i.id);
        const idx = ids.indexOf(itemId);
        const swap = direction === "up" ? idx - 1 : idx + 1;
        if (idx !== -1 && swap >= 0 && swap < ids.length) {
          [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
          await da.programItems.reorder(actor, sessionId, ids);
        }
      }
      return { ok: true };
    }
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof AlreadyExistsError ||
      error instanceof NotFoundError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  return { error: "Unknown action." };
}

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

const smallButton =
  "rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700";

function toDateInput(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDateOnly(date: Date | null): string {
  if (!date) return "";
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

type SpeakerOption = Route.ComponentProps["loaderData"]["speakers"][number];

function KindSelect({
  id,
  defaultValue,
  label = "Kind",
}: {
  id: string;
  defaultValue: ProgramItemKind;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select id={id} name="kind" defaultValue={defaultValue} className={inputClass}>
        {PROGRAM_ITEM_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {programKindLabel(kind)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ProgramBuilder({ loaderData }: Route.ComponentProps) {
  const { edition, sessions, unplaced, speakers } = loaderData;
  const actionData = useActionData<typeof action>();

  const statusRef = useRef<HTMLParagraphElement>(null);
  const error = actionData && "error" in actionData ? actionData.error : null;
  const ok = actionData && "ok" in actionData ? actionData.ok : null;

  useEffect(() => {
    if (actionData) statusRef.current?.focus();
  }, [actionData]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Program</h1>
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
          Build the schedule as ordered sessions. Add accepted abstracts from the
          picker, or add a custom item like a keynote or a break.
        </p>
      </div>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={
          error
            ? "rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            : ok
              ? "rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
              : "sr-only"
        }
      >
        {typeof error === "string" ? error : typeof ok === "string" ? ok : ""}
      </p>

      {sessions.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          No sessions yet. Add the first one below.
        </p>
      ) : (
        <ol className="space-y-6">
          {sessions.map((session, index) => (
            <SessionCard
              key={session.id}
              session={session}
              index={index}
              count={sessions.length}
              unplaced={unplaced}
              speakers={speakers}
            />
          ))}
        </ol>
      )}

      <section className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-lg font-medium">Add a session</h2>
        <Form method="post" className="space-y-3" noValidate>
          <input type="hidden" name="intent" value="session-create" />
          <SessionFields />
          <button
            type="submit"
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Add session
          </button>
        </Form>
      </section>
    </div>
  );
}

function SessionFields({
  session,
}: {
  session?: ProgramSessionResolved;
}) {
  const idBase = session ? session.id : "new";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={`title-${idBase}`} className="block text-sm font-medium">
          Title
        </label>
        <input
          id={`title-${idBase}`}
          name="title"
          type="text"
          required
          defaultValue={session?.title ?? ""}
          placeholder="Morning oral session"
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`date-${idBase}`} className="block text-sm font-medium">
          Date
        </label>
        <input
          id={`date-${idBase}`}
          name="sessionDate"
          type="date"
          defaultValue={toDateInput(session?.sessionDate ?? null)}
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`loc-${idBase}`} className="block text-sm font-medium">
          Location
        </label>
        <input
          id={`loc-${idBase}`}
          name="location"
          type="text"
          defaultValue={session?.location ?? ""}
          placeholder="Room A"
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`start-${idBase}`} className="block text-sm font-medium">
          Starts
        </label>
        <input
          id={`start-${idBase}`}
          name="startsAt"
          type="datetime-local"
          defaultValue={toDateTimeLocal(session?.startsAt ?? null)}
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`end-${idBase}`} className="block text-sm font-medium">
          Ends
        </label>
        <input
          id={`end-${idBase}`}
          name="endsAt"
          type="datetime-local"
          defaultValue={toDateTimeLocal(session?.endsAt ?? null)}
          className={inputClass}
        />
      </div>
    </div>
  );
}

function SessionCard({
  session,
  index,
  count,
  unplaced,
  speakers,
}: {
  session: ProgramSessionResolved;
  index: number;
  count: number;
  unplaced: ProgramAbstractOption[];
  speakers: SpeakerOption[];
}) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  return (
    <li className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{session.title}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {session.sessionDate ? formatDateOnly(session.sessionDate) : "No date set"}
            {session.location ? ` . ${session.location}` : ""}
          </p>
          {session.startsAt || session.endsAt ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {session.startsAt ? formatDateTime(session.startsAt) : "?"}
              {session.endsAt ? ` to ${formatDateTime(session.endsAt)}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Form method="post">
            <input type="hidden" name="intent" value="session-move" />
            <input type="hidden" name="sessionId" value={session.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={busy || index === 0}
              aria-label={`Move ${session.title} up`}
              className={smallButton}
            >
              Up
            </button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="session-move" />
            <input type="hidden" name="sessionId" value={session.id} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              disabled={busy || index === count - 1}
              aria-label={`Move ${session.title} down`}
              className={smallButton}
            >
              Down
            </button>
          </Form>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Items</h3>
        {session.items.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No items in this session yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {session.items.map((item, itemIndex) => (
              <li
                key={item.id}
                className="rounded border border-gray-100 p-3 dark:border-gray-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="text-sm">
                    <span className="mb-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {programKindLabel(item.kind)}
                    </span>
                    {item.abstractId ? (
                      <p>
                        {item.abstractNumber ? (
                          <span className="font-medium">
                            #{item.abstractNumber}{" "}
                          </span>
                        ) : null}
                        <span
                          dangerouslySetInnerHTML={{
                            __html: item.abstractTitle ?? "Abstract",
                          }}
                        />
                        {item.presentingAuthorName ? (
                          <span className="text-gray-600 dark:text-gray-400">
                            {" "}
                            . {item.presentingAuthorName}
                          </span>
                        ) : null}
                      </p>
                    ) : item.speakerId ? (
                      <p>
                        <span className="font-medium">
                          {item.speakerName ?? "Invited speaker"}
                        </span>
                        {item.speakerTalkTitle ? (
                          <span className="text-gray-600 dark:text-gray-400">
                            {" "}
                            . {item.speakerTalkTitle}
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="font-medium">{item.customTitle}</p>
                    )}
                    {item.startsAt ? (
                      <p className="text-gray-600 dark:text-gray-400">
                        {formatDateTime(item.startsAt)}
                      </p>
                    ) : null}
                    {item.note ? (
                      <p className="text-gray-600 dark:text-gray-400">
                        {item.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Form method="post">
                      <input type="hidden" name="intent" value="item-move" />
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={busy || itemIndex === 0}
                        aria-label="Move item up"
                        className={smallButton}
                      >
                        Up
                      </button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="item-move" />
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={busy || itemIndex === session.items.length - 1}
                        aria-label="Move item down"
                        className={smallButton}
                      >
                        Down
                      </button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="item-delete" />
                      <input type="hidden" name="itemId" value={item.id} />
                      <button
                        type="submit"
                        disabled={busy}
                        className="text-sm font-medium text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-red-400"
                      >
                        Remove
                      </button>
                    </Form>
                  </div>
                </div>

                <Form method="post" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input type="hidden" name="intent" value="item-update" />
                  <input type="hidden" name="itemId" value={item.id} />
                  <KindSelect
                    id={`itemkind-${item.id}`}
                    defaultValue={item.kind}
                  />
                  <div className="space-y-1">
                    <label
                      htmlFor={`itemtime-${item.id}`}
                      className="block text-sm font-medium"
                    >
                      Time
                    </label>
                    <input
                      id={`itemtime-${item.id}`}
                      name="startsAt"
                      type="datetime-local"
                      defaultValue={toDateTimeLocal(item.startsAt)}
                      className={inputClass}
                    />
                  </div>
                  {item.abstractId === null && item.speakerId === null ? (
                    <div className="space-y-1 sm:col-span-2">
                      <label
                        htmlFor={`itemtitle-${item.id}`}
                        className="block text-sm font-medium"
                      >
                        Title
                      </label>
                      <input
                        id={`itemtitle-${item.id}`}
                        name="customTitle"
                        type="text"
                        required
                        defaultValue={item.customTitle ?? ""}
                        className={inputClass}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1 sm:col-span-2">
                    <label
                      htmlFor={`itemnote-${item.id}`}
                      className="block text-sm font-medium"
                    >
                      Note
                    </label>
                    <input
                      id={`itemnote-${item.id}`}
                      name="note"
                      type="text"
                      defaultValue={item.note ?? ""}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button type="submit" disabled={busy} className={smallButton}>
                      Save item
                    </button>
                  </div>
                </Form>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Form method="post" className="space-y-2 rounded border border-gray-100 p-3 dark:border-gray-900">
          <input type="hidden" name="intent" value="item-add-abstract" />
          <input type="hidden" name="sessionId" value={session.id} />
          <label
            htmlFor={`add-abstract-${session.id}`}
            className="block text-sm font-medium"
          >
            Add an accepted abstract
          </label>
          {unplaced.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No unplaced accepted abstracts.
            </p>
          ) : (
            <>
              <select
                id={`add-abstract-${session.id}`}
                name="abstractId"
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>
                  Choose an abstract
                </option>
                {unplaced.map((option) => (
                  <option key={option.abstractId} value={option.abstractId}>
                    #{option.number} {extractPlainText(option.title)}
                    {option.presentingAuthorName
                      ? ` (${option.presentingAuthorName})`
                      : ""}
                  </option>
                ))}
              </select>
              <KindSelect id={`add-abstract-kind-${session.id}`} defaultValue="talk" />
              <button type="submit" disabled={busy} className={smallButton}>
                Add abstract
              </button>
            </>
          )}
        </Form>

        <Form method="post" className="space-y-2 rounded border border-gray-100 p-3 dark:border-gray-900">
          <input type="hidden" name="intent" value="item-add-speaker" />
          <input type="hidden" name="sessionId" value={session.id} />
          <label
            htmlFor={`add-speaker-${session.id}`}
            className="block text-sm font-medium"
          >
            Add an invited speaker
          </label>
          {speakers.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No invited speakers yet.
            </p>
          ) : (
            <>
              <select
                id={`add-speaker-${session.id}`}
                name="speakerId"
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>
                  Choose a speaker
                </option>
                {speakers.map((speaker) => (
                  <option key={speaker.id} value={speaker.id}>
                    {speaker.name}
                    {speaker.role ? ` (${speakerRoleLabel(speaker.role)})` : ""}
                  </option>
                ))}
              </select>
              <KindSelect
                id={`add-speaker-kind-${session.id}`}
                defaultValue="keynote"
              />
              <button type="submit" disabled={busy} className={smallButton}>
                Add speaker
              </button>
            </>
          )}
        </Form>

        <Form method="post" className="space-y-2 rounded border border-gray-100 p-3 dark:border-gray-900">
          <input type="hidden" name="intent" value="item-add-custom" />
          <input type="hidden" name="sessionId" value={session.id} />
          <label
            htmlFor={`custom-title-${session.id}`}
            className="block text-sm font-medium"
          >
            Add a custom item
          </label>
          <input
            id={`custom-title-${session.id}`}
            name="customTitle"
            type="text"
            required
            placeholder="Break, lunch, poster session"
            className={inputClass}
          />
          <KindSelect id={`custom-kind-${session.id}`} defaultValue="other" />
          <input
            name="startsAt"
            type="datetime-local"
            aria-label="Custom item time"
            className={inputClass}
          />
          <input
            name="note"
            type="text"
            aria-label="Custom item note"
            placeholder="Optional note"
            className={inputClass}
          />
          <button type="submit" disabled={busy} className={smallButton}>
            Add item
          </button>
        </Form>
      </div>

      <details className="rounded border border-gray-100 p-3 dark:border-gray-900">
        <summary className="cursor-pointer text-sm font-medium">
          Edit or delete this session
        </summary>
        <div className="mt-3 space-y-3">
          <Form method="post" className="space-y-3" noValidate>
            <input type="hidden" name="intent" value="session-update" />
            <input type="hidden" name="sessionId" value={session.id} />
            <SessionFields session={session} />
            <button type="submit" disabled={busy} className={smallButton}>
              Save session
            </button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="session-delete" />
            <input type="hidden" name="sessionId" value={session.id} />
            <button
              type="submit"
              disabled={busy}
              onClick={(e) => {
                if (!window.confirm("Delete this session and its items?")) {
                  e.preventDefault();
                }
              }}
              className="text-sm font-medium text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-red-400"
            >
              Delete session
            </button>
          </Form>
        </div>
      </details>
    </li>
  );
}
