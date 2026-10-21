import { Form } from "react-router";
import type {
  ProgramAbstractOption,
  ProgramDay,
  ProgramSessionResolved,
} from "~/lib/data-access";
import { toDateTimeLocal } from "~/lib/format";
import { AddItemForms, ItemRow } from "./items";
import {
  inputClass,
  slotTimeLine,
  smallButton,
  type SpeakerOption,
  toDateInput,
} from "./shared";

export function SessionFields({
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
              className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Delete session
            </button>
          </Form>
        </div>
      </details>
    </div>
  );
}

export function Slot({
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
