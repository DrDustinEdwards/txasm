import { useEffect, useRef } from "react";
import {
  Form,
  Link,
  useActionData,
  useNavigation,
  useSearchParams,
} from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.program";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  NotFoundError,
  ValidationError,
  getDataAccess,
  type ProgramAbstractOption,
  type ProgramDay,
  type ProgramItemKind,
  type ProgramSessionResolved,
} from "~/lib/data-access";
import { formatDateTime, toDateTimeLocal } from "~/lib/format";
import { extractPlainText } from "~/lib/richtext";
import { renderProgramBook } from "~/lib/program-book";
import { renderBookPdf } from "~/lib/book-pdf.server";
import {
  PROGRAM_ITEM_KINDS,
  programKindColor,
  programKindLabel,
  speakerRoleLabel,
} from "~/lib/vocab";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Program | Texas Branch ASM" }];
}

// Named config, not a bare literal: one day in milliseconds, for enumerating the
// meeting date range into day tabs.
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NO_DATE_KEY = "no-date";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const schedule = await da.programSessions.getScheduleForEdition(
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
  const document = await da.programDocuments.getProgramDocument(
    actor,
    params.editionId,
  );
  return {
    edition: { id: edition.id, name: edition.name },
    schedule,
    unplaced,
    speakers,
    document,
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
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const editionId = params.editionId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  // Generate the program PDF only on this explicit intent, never on load. Runs
  // Browser Rendering, so it is its own path with its own error handling.
  if (intent === "document-generate") {
    try {
      await da.programDocuments.recordProgramGenerating(actor, editionId);
    } catch (error) {
      if (error instanceof ValidationError) return { error: error.message };
      throw error;
    }
    try {
      const data = await da.program.getProgramData(actor, editionId);
      const html = renderProgramBook(data);
      const bytes = await renderBookPdf(html, env);

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const r2Key = `editions/${editionId}/program-${stamp}.pdf`;
      const fileName = `${data.meeting.name} Program.pdf`;

      await env.BOOKS.put(r2Key, bytes, {
        httpMetadata: { contentType: "application/pdf" },
      });
      await da.programDocuments.recordProgramReady(actor, editionId, {
        r2Key,
        fileName,
      });
      return { ok: "The program PDF is ready." };
    } catch (error) {
      await da.programDocuments.recordProgramFailed(actor, editionId);
      console.error("[program] generation failed", error);
      const detail = error instanceof Error ? error.message : "";
      return {
        error: `The program could not be generated.${detail ? ` ${detail}` : ""}`,
      };
    }
  }

  try {
    if (intent === "session-create") {
      await da.programSessions.create(actor, {
        editionId,
        title: String(form.get("title") ?? ""),
        sessionDate: parseWhen(form.get("sessionDate")),
        startsAt: parseWhen(form.get("startsAt")),
        endsAt: parseWhen(form.get("endsAt")),
        location: String(form.get("location") ?? ""),
        moderator: String(form.get("moderator") ?? ""),
      });
      return { ok: "Session added." };
    }

    if (intent === "session-add-concurrent") {
      await da.programSessions.addConcurrentSession(actor, {
        sessionId: String(form.get("sessionId") ?? ""),
        title: String(form.get("title") ?? ""),
        location: String(form.get("location") ?? ""),
      });
      return { ok: "Concurrent session added." };
    }

    if (intent === "session-update") {
      await da.programSessions.update(actor, String(form.get("sessionId") ?? ""), {
        title: String(form.get("title") ?? ""),
        sessionDate: parseWhen(form.get("sessionDate")),
        startsAt: parseWhen(form.get("startsAt")),
        endsAt: parseWhen(form.get("endsAt")),
        location: String(form.get("location") ?? ""),
        moderator: String(form.get("moderator") ?? ""),
      });
      return { ok: "Session saved." };
    }

    if (intent === "session-delete") {
      await da.programSessions.remove(actor, String(form.get("sessionId") ?? ""));
      return { ok: "Session removed." };
    }

    if (intent === "session-move") {
      // Reorder within the day: swap this session with its day neighbor in the
      // display order, then persist through the edition-wide sort order.
      const sessionId = String(form.get("sessionId") ?? "");
      const direction = String(form.get("direction") ?? "");
      const schedule = await da.programSessions.getScheduleForEdition(
        actor,
        editionId,
      );
      const day = schedule.days.find((d) =>
        d.groups.some((g) => g.sessions.some((s) => s.id === sessionId)),
      );
      const dayOrder = day
        ? day.groups.flatMap((g) => g.sessions).map((s) => s.id)
        : [];
      const idx = dayOrder.indexOf(sessionId);
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (idx !== -1 && swap >= 0 && swap < dayOrder.length) {
        const neighborId = dayOrder[swap];
        const all = await da.programSessions.listForEdition(actor, editionId);
        const ids = all.map((s) => s.id);
        const i = ids.indexOf(sessionId);
        const j = ids.indexOf(neighborId);
        if (i !== -1 && j !== -1) {
          [ids[i], ids[j]] = [ids[j], ids[i]];
          await da.programSessions.reorder(actor, editionId, ids);
        }
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

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

function toDateInput(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function dayTabLabel(key: string): string {
  if (key === NO_DATE_KEY) return "No date";
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? key : DAY_FMT.format(date);
}

function timeLabel(date: Date | null): string {
  return date ? `${TIME_FMT.format(date)} UTC` : "";
}

function slotTimeLine(session: ProgramSessionResolved): string {
  const start = timeLabel(session.startsAt);
  const end = timeLabel(session.endsAt);
  if (start && end) return `${start} to ${end}`;
  return start || end || "No time set";
}

// The union of days that carry sessions and days inside the meeting range, so a
// meeting day with nothing scheduled still gets a tab. Chronological, with the
// undated bucket (if any) last.
function buildDayKeys(
  days: ProgramDay[],
  meetingStartsAt: Date | null,
  meetingEndsAt: Date | null,
  extra: string | null,
): string[] {
  const keys = new Set<string>();
  let hasNoDate = false;
  for (const day of days) {
    if (day.key === NO_DATE_KEY) hasNoDate = true;
    else keys.add(day.key);
  }
  if (meetingStartsAt) {
    const start = Date.UTC(
      meetingStartsAt.getUTCFullYear(),
      meetingStartsAt.getUTCMonth(),
      meetingStartsAt.getUTCDate(),
    );
    const endDate = meetingEndsAt ?? meetingStartsAt;
    const end = Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
    );
    for (let t = start; t <= end; t += MS_PER_DAY) {
      keys.add(new Date(t).toISOString().slice(0, 10));
    }
  }
  if (extra && extra !== NO_DATE_KEY) keys.add(extra);
  const sorted = [...keys].sort();
  if (hasNoDate) sorted.push(NO_DATE_KEY);
  return sorted;
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

function SessionFields({
  session,
  defaultDate,
}: {
  session?: ProgramSessionResolved;
  defaultDate?: string;
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
          defaultValue={toDateInput(session?.sessionDate ?? null) || defaultDate || ""}
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`loc-${idBase}`} className="block text-sm font-medium">
          Room
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
      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={`mod-${idBase}`} className="block text-sm font-medium">
          Moderator (optional)
        </label>
        <input
          id={`mod-${idBase}`}
          name="moderator"
          type="text"
          defaultValue={session?.moderator ?? ""}
          placeholder="Dr. Jane Rivera"
          className={inputClass}
        />
      </div>
    </div>
  );
}

function ItemRow({
  session,
  item,
  index,
  count,
  busy,
}: {
  session: ProgramSessionResolved;
  item: ProgramSessionResolved["items"][number];
  index: number;
  count: number;
  busy: boolean;
}) {
  const isCustom = item.abstractId === null && item.speakerId === null;
  return (
    <li className="rounded border border-gray-100 p-3 dark:border-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm">
          <span
            className={`mb-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${programKindColor(item.kind)}`}
          >
            {programKindLabel(item.kind)}
          </span>
          {item.abstractId ? (
            <p>
              {item.abstractNumber ? (
                <span className="font-medium">#{item.abstractNumber} </span>
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
          {item.note ? (
            <p className="text-gray-600 dark:text-gray-400">{item.note}</p>
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
              disabled={busy || index === 0}
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
              disabled={busy || index === count - 1}
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

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-400">
          Edit item
        </summary>
        <Form method="post" className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="item-update" />
          <input type="hidden" name="itemId" value={item.id} />
          <KindSelect id={`itemkind-${item.id}`} defaultValue={item.kind} />
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
          {isCustom ? (
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
      </details>
    </li>
  );
}

function AddItemForms({
  session,
  unplaced,
  speakers,
  busy,
}: {
  session: ProgramSessionResolved;
  unplaced: ProgramAbstractOption[];
  speakers: SpeakerOption[];
  busy: boolean;
}) {
  return (
    <div className="space-y-3">
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
  );
}

function SessionColumn({
  session,
  dayIndex,
  dayCount,
  busy,
  unplaced,
  speakers,
}: {
  session: ProgramSessionResolved;
  dayIndex: number;
  dayCount: number;
  busy: boolean;
  unplaced: ProgramAbstractOption[];
  speakers: SpeakerOption[];
}) {
  return (
    <div className="flex flex-col gap-4 rounded border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{session.title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {session.location ? session.location : "No room set"} . {slotTimeLine(session)}
          </p>
          {session.moderator ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Moderated by {session.moderator}
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
              disabled={busy || dayIndex === 0}
              aria-label={`Move ${session.title} earlier`}
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
              disabled={busy || dayIndex === dayCount - 1}
              aria-label={`Move ${session.title} later`}
              className={smallButton}
            >
              Down
            </button>
          </Form>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Items</h4>
        {session.items.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No items in this session yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {session.items.map((item, itemIndex) => (
              <ItemRow
                key={item.id}
                session={session}
                item={item}
                index={itemIndex}
                count={session.items.length}
                busy={busy}
              />
            ))}
          </ol>
        )}
      </div>

      <details className="rounded border border-gray-100 p-3 dark:border-gray-900">
        <summary className="cursor-pointer text-sm font-medium">Add an item</summary>
        <div className="mt-3">
          <AddItemForms
            session={session}
            unplaced={unplaced}
            speakers={speakers}
            busy={busy}
          />
        </div>
      </details>

      <details className="rounded border border-gray-100 p-3 dark:border-gray-900">
        <summary className="cursor-pointer text-sm font-medium">
          Edit or delete session
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
    </div>
  );
}

function Slot({
  group,
  flatIndexOf,
  dayCount,
  busy,
  unplaced,
  speakers,
}: {
  group: ProgramDay["groups"][number];
  flatIndexOf: (id: string) => number;
  dayCount: number;
  busy: boolean;
  unplaced: ProgramAbstractOption[];
  speakers: SpeakerOption[];
}) {
  const trackCount = group.sessions.length;
  const source = group.sessions[0];
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {slotTimeLine(source)}
          {trackCount > 1 ? (
            <span className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              {trackCount} parallel tracks
            </span>
          ) : null}
        </h3>
      </div>

      {trackCount === 1 ? (
        <SessionColumn
          session={source}
          dayIndex={flatIndexOf(source.id)}
          dayCount={dayCount}
          busy={busy}
          unplaced={unplaced}
          speakers={speakers}
        />
      ) : (
        // N dynamic columns, one per concurrent track. minmax keeps each track
        // readable and lets the row scroll on narrow screens rather than crush.
        <div className="overflow-x-auto">
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${trackCount}, minmax(18rem, 1fr))`,
            }}
          >
            {group.sessions.map((session) => (
              <SessionColumn
                key={session.id}
                session={session}
                dayIndex={flatIndexOf(session.id)}
                dayCount={dayCount}
                busy={busy}
                unplaced={unplaced}
                speakers={speakers}
              />
            ))}
          </div>
        </div>
      )}

      <Form
        method="post"
        className="flex flex-wrap items-end gap-2 rounded border border-dashed border-gray-300 p-3 dark:border-gray-700"
      >
        <input type="hidden" name="intent" value="session-add-concurrent" />
        <input type="hidden" name="sessionId" value={source.id} />
        <div className="flex-1 space-y-1">
          <label
            htmlFor={`concurrent-title-${source.id}`}
            className="block text-sm font-medium"
          >
            Add a concurrent session (parallel track)
          </label>
          <input
            id={`concurrent-title-${source.id}`}
            name="title"
            type="text"
            required
            placeholder="Second track title"
            className={inputClass}
          />
        </div>
        <div className="flex-1 space-y-1">
          <label
            htmlFor={`concurrent-room-${source.id}`}
            className="block text-sm font-medium"
          >
            Room
          </label>
          <input
            id={`concurrent-room-${source.id}`}
            name="location"
            type="text"
            placeholder="Room B"
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={busy} className={smallButton}>
          Add track
        </button>
      </Form>
    </section>
  );
}

function ProgramDocumentPanel({
  document,
  editionId,
  busy,
}: {
  document: Route.ComponentProps["loaderData"]["document"];
  editionId: string;
  busy: boolean;
}) {
  return (
    <section className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800">
      <h2 className="text-lg font-medium">Program document</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Generate the printable program PDF from this schedule. It runs Browser
        Rendering and can take up to a minute.
      </p>
      {!document ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          No program PDF generated yet.
        </p>
      ) : document.status === "ready" ? (
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium text-green-700 dark:text-green-400">
              Ready
            </span>
            {document.generatedAt
              ? ` . Generated ${formatDateTime(document.generatedAt)}`
              : ""}
          </p>
          <p>
            <a
              href={`/admin/editions/${editionId}/program-document/download`}
              className="font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Download the PDF
            </a>
          </p>
        </div>
      ) : document.status === "generating" ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          A generation is in progress. Refresh this page in a minute to see the
          result.
        </p>
      ) : document.status === "failed" ? (
        <p className="text-sm text-red-700 dark:text-red-400">
          The last generation failed. Try again below.
        </p>
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-300">Pending</p>
      )}
      <Form method="post">
        <input type="hidden" name="intent" value="document-generate" />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {document ? "Regenerate program PDF" : "Generate program PDF"}
        </button>
      </Form>
    </section>
  );
}

export default function ProgramBuilder({ loaderData }: Route.ComponentProps) {
  const { edition, schedule, unplaced, speakers, document } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const [searchParams, setSearchParams] = useSearchParams();

  const statusRef = useRef<HTMLParagraphElement>(null);
  const error = actionData && "error" in actionData ? actionData.error : null;
  const ok = actionData && "ok" in actionData ? actionData.ok : null;
  useEffect(() => {
    if (actionData) statusRef.current?.focus();
  }, [actionData]);

  const dayParam = searchParams.get("day");
  const dayKeys = buildDayKeys(
    schedule.days,
    schedule.meetingStartsAt,
    schedule.meetingEndsAt,
    dayParam,
  );
  const selectedDay =
    dayParam && dayKeys.includes(dayParam) ? dayParam : dayKeys[0] ?? null;
  const day = schedule.days.find((d) => d.key === selectedDay) ?? null;
  const flatOrder = day
    ? day.groups.flatMap((g) => g.sessions).map((s) => s.id)
    : [];
  const flatIndexOf = (id: string) => flatOrder.indexOf(id);

  function selectDay(key: string) {
    const next = new URLSearchParams(searchParams);
    next.set("day", key);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Schedule</h1>
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
          Build the meeting day by day. Sessions that overlap in time on the same
          day become parallel tracks automatically, one column per session.
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

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Meeting days" className="flex flex-wrap gap-2">
          {dayKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => selectDay(key)}
              aria-current={key === selectedDay ? "page" : undefined}
              className={
                key === selectedDay
                  ? "rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                  : "rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-900"
              }
            >
              {dayTabLabel(key)}
            </button>
          ))}
        </nav>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span>Add day</span>
          <input
            type="date"
            aria-label="Add a day"
            value=""
            onChange={(e) => {
              if (e.target.value) selectDay(e.target.value);
            }}
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
      </div>

      {selectedDay === null ? (
        <p className="text-gray-700 dark:text-gray-300">
          No days yet. Set the meeting dates on the meeting page, or add a session
          with a date below.
        </p>
      ) : (
        <div className="space-y-8">
          <h2 className="text-lg font-semibold">{dayTabLabel(selectedDay)}</h2>
          {day && day.groups.length > 0 ? (
            <div className="space-y-8">
              {day.groups.map((group, gi) => (
                <Slot
                  key={group.sessions[0]?.id ?? gi}
                  group={group}
                  flatIndexOf={flatIndexOf}
                  dayCount={flatOrder.length}
                  busy={busy}
                  unplaced={unplaced}
                  speakers={speakers}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-700 dark:text-gray-300">
              Nothing scheduled on this day yet.
            </p>
          )}

          <section className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
            <h3 className="text-base font-medium">Add a session to this day</h3>
            <Form method="post" className="space-y-3" noValidate>
              <input type="hidden" name="intent" value="session-create" />
              <SessionFields
                defaultDate={
                  selectedDay === NO_DATE_KEY ? "" : selectedDay ?? ""
                }
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
              >
                Add session
              </button>
            </Form>
          </section>
        </div>
      )}

      <ProgramDocumentPanel
        document={document}
        editionId={edition.id}
        busy={busy}
      />
    </div>
  );
}
