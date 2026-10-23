import { Form } from "react-router";
import type { ProgramAbstractOption, ProgramDay, ProgramSessionResolved } from "~/lib/data-access";
import { toDateTimeLocal } from "~/lib/format";
import { AddItemForms, ItemRow } from "./items";
import { inputClass, slotTimeLine, type SpeakerOption, toDateInput } from "./shared";

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
    <div className="card stack-4">
      <div className="spread">
        <div>
          <h3 className="strong">{session.title}</h3>
          <p className="small cap-muted">
            {session.location ? session.location : "No room set"} . {slotTimeLine(session)}
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
        <h4 className="small strong">Items</h4>
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
              onClick={(e) => {
                if (!window.confirm("Delete this session and its items?")) {
                  e.preventDefault();
                }
              }}
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
    <section className="stack-3">
      <div className="spread">
        <h3 className="small strong">
          {slotTimeLine(source)}
          {trackCount > 1 ? (
            <span className="tiny strong cap-muted">{trackCount} parallel tracks</span>
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
        <div className="track-scroll">
          <div
            className="track-grid"
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
    </section>
  );
}
