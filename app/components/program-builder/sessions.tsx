import { Form } from "react-router";
import { slotLabel, type ScheduleSlot } from "capsomer/behavior/schedule";
import type { ProgramAbstractOption, ProgramSessionResolved } from "~/lib/data-access";
import { toDateTimeLocal } from "~/lib/format";
import { AddItemForms, ItemRow } from "./items";
import { type SpeakerOption, toDateInput } from "./shared";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";

export function SessionFields({
  session,
  defaultDate,
}: {
  session?: ProgramSessionResolved;
  defaultDate?: string;
}) {
  const idBase = session ? session.id : "new";
  return (
    <div className="grid-2">
      <div className="stack-1 span-2">
        <label htmlFor={`title-${idBase}`} className="cap-field-label">
          Title
        </label>
        <input
          id={`title-${idBase}`}
          name="title"
          type="text"
          required
          defaultValue={session?.title ?? ""}
          placeholder="Morning oral session"
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`date-${idBase}`} className="cap-field-label">
          Date
        </label>
        <input
          id={`date-${idBase}`}
          name="sessionDate"
          type="date"
          defaultValue={toDateInput(session?.sessionDate ?? null) || defaultDate || ""}
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`loc-${idBase}`} className="cap-field-label">
          Room
        </label>
        <input
          id={`loc-${idBase}`}
          name="location"
          type="text"
          defaultValue={session?.location ?? ""}
          placeholder="Room A"
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`start-${idBase}`} className="cap-field-label">
          Starts
        </label>
        <input
          id={`start-${idBase}`}
          name="startsAt"
          type="datetime-local"
          defaultValue={toDateTimeLocal(session?.startsAt ?? null)}
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`end-${idBase}`} className="cap-field-label">
          Ends
        </label>
        <input
          id={`end-${idBase}`}
          name="endsAt"
          type="datetime-local"
          defaultValue={toDateTimeLocal(session?.endsAt ?? null)}
          className="cap-input"
        />
      </div>
      <div className="stack-1 span-2">
        <label htmlFor={`mod-${idBase}`} className="cap-field-label">
          Moderator (optional)
        </label>
        <input
          id={`mod-${idBase}`}
          name="moderator"
          type="text"
          defaultValue={session?.moderator ?? ""}
          placeholder="Dr. Jane Rivera"
          className="cap-input"
        />
      </div>
    </div>
  );
}

// One session in the builder's Schedule: its facts, its items and its controls.
// `level` is the heading level Capsomer's Schedule gives the session's title.
export function SessionCard({
  session,
  level,
  dayIndex,
  dayCount,
  busy,
  unplaced,
  speakers,
}: {
  session: ProgramSessionResolved;
  level: 3 | 4 | 5;
  dayIndex: number;
  dayCount: number;
  busy: boolean;
  unplaced: ProgramAbstractOption[];
  speakers: SpeakerOption[];
}) {
  const H = `h${level}` as "h3" | "h4" | "h5";
  const Sub = `h${level + 1}` as "h4" | "h5" | "h6";
  return (
    <div className="card stack-4">
      <div className="spread">
        <div>
          <H className="strong">{session.title}</H>
          <p className="small cap-muted">
            {session.location ? session.location : "No room set"} ·{" "}
            {slotLabel(session.startsAt?.getTime() ?? null, session.endsAt?.getTime() ?? null)}
          </p>
          {session.moderator ? (
            <p className="small cap-muted">Moderated by {session.moderator}</p>
          ) : null}
        </div>
        <div className="cluster">
          <Form method="post">
            <input type="hidden" name="intent" value="session-move" />
            <input type="hidden" name="sessionId" value={session.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={busy || dayIndex === 0}
              aria-label={`Move ${session.title} earlier`}
              className="cap-btn"
              data-size="sm"
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
              className="cap-btn"
              data-size="sm"
            >
              Down
            </button>
          </Form>
        </div>
      </div>

      <div className="stack-2">
        <Sub className="small strong">Items</Sub>
        {session.items.length === 0 ? (
          <p className="small cap-muted">No items in this session yet.</p>
        ) : (
          <ol className="stack-2">
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

      <details className="card card-s">
        <summary className="summary">Add an item</summary>
        <div className="mt-3">
          <AddItemForms session={session} unplaced={unplaced} speakers={speakers} busy={busy} />
        </div>
      </details>

      <details className="card card-s">
        <summary className="summary">Edit or delete session</summary>
        <div className="stack-3 mt-3">
          <Form method="post" className="stack-3" noValidate>
            <input type="hidden" name="intent" value="session-update" />
            <input type="hidden" name="sessionId" value={session.id} />
            <SessionFields session={session} />
            <button type="submit" disabled={busy} className="cap-btn" data-size="sm">
              Save session
            </button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="session-delete" />
            <input type="hidden" name="sessionId" value={session.id} />
            <button
              type="submit"
              disabled={busy}
              onClick={(e) =>
                confirmSubmit(e, {
                  title: "Delete this session and its items?",
                  action: "Delete session",
                })
              }
              className="small strong"
            >
              Delete session
            </button>
          </Form>
        </div>
      </details>
    </div>
  );
}

// The form under a slot's tracks that adds a parallel track: a session with the
// slot's first session's day and times, in another room.
export function ConcurrentSessionForm({
  slot,
  busy,
}: {
  slot: ScheduleSlot<ProgramSessionResolved>;
  busy: boolean;
}) {
  const source = slot.items[0];
  if (!source) return null;
  return (
    <Form method="post" className="card card-s card-dashed cluster cluster-end">
      <input type="hidden" name="intent" value="session-add-concurrent" />
      <input type="hidden" name="sessionId" value={source.id} />
      <div className="grow stack-1">
        <label htmlFor={`concurrent-title-${source.id}`} className="cap-field-label">
          Add a concurrent session (parallel track)
        </label>
        <input
          id={`concurrent-title-${source.id}`}
          name="title"
          type="text"
          required
          placeholder="Second track title"
          className="cap-input"
        />
      </div>
      <div className="grow stack-1">
        <label htmlFor={`concurrent-room-${source.id}`} className="cap-field-label">
          Room
        </label>
        <input
          id={`concurrent-room-${source.id}`}
          name="location"
          type="text"
          placeholder="Room B"
          className="cap-input"
        />
      </div>
      <button type="submit" disabled={busy} className="cap-btn" data-size="sm">
        Add track
      </button>
    </Form>
  );
}
