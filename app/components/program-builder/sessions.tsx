import { Form } from "react-router";
import { Panel } from "capsomer/react/panel";
import { isoDay } from "@drdustinedwards/site-helpers/xml";
import { slotLabel, type ScheduleSlot } from "capsomer/behavior/schedule";
import type { ProgramAbstractOption, ProgramSessionResolved } from "~/lib/data-access";
import { DateTimeField } from "capsomer/react/field";
import { Disclosure } from "capsomer/react/disclosure";
import { AddItemForms, SessionItems } from "./items";
import { type SpeakerOption } from "./shared";
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
    <div className="cap-grid" data-cols="2">
      <div className="cap-stack cap-full" data-gap="2">
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
      <div className="cap-stack" data-gap="2">
        <label htmlFor={`date-${idBase}`} className="cap-field-label">
          Date
        </label>
        <input
          id={`date-${idBase}`}
          name="sessionDate"
          type="date"
          defaultValue={isoDay(session?.sessionDate) || defaultDate || ""}
          className="cap-input"
        />
      </div>
      <div className="cap-stack" data-gap="2">
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
      <DateTimeField
        id={`start-${idBase}`}
        name="startsAt"
        label="Starts"
        defaultDate={session?.startsAt ?? null}
      />
      <DateTimeField
        id={`end-${idBase}`}
        name="endsAt"
        label="Ends"
        defaultDate={session?.endsAt ?? null}
      />
      <div className="cap-stack cap-full" data-gap="2">
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
    <Panel>
      <div className="cap-stack">
        <div className="cap-spread">
          <div>
            <H className="cap-text" data-weight="strong">
              {session.title}
            </H>
            <p className="cap-text cap-muted" data-size="small">
              {session.location ? session.location : "No room set"} ·{" "}
              {slotLabel(session.startsAt?.getTime() ?? null, session.endsAt?.getTime() ?? null)}
            </p>
            {session.moderator ? (
              <p className="cap-text cap-muted" data-size="small">
                Moderated by {session.moderator}
              </p>
            ) : null}
          </div>
          <div className="cap-cluster">
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

        <div className="cap-stack" data-gap="3">
          <Sub className="cap-text" data-size="small" data-weight="strong">
            Items
          </Sub>
          <SessionItems session={session} busy={busy} />
        </div>

        <Disclosure summary="Add an item" variant="card" size="sm" marker="triangle">
          <AddItemForms session={session} unplaced={unplaced} speakers={speakers} busy={busy} />
        </Disclosure>

        <Disclosure summary="Edit or delete session" variant="card" size="sm" marker="triangle">
          <div className="cap-stack" data-gap="4">
            <Form method="post" className="cap-stack" data-gap="4" noValidate>
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
                className="cap-btn"
                data-variant="link"
              >
                Delete session
              </button>
            </Form>
          </div>
        </Disclosure>
      </div>
    </Panel>
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
    <Panel size="sm">
      <Form method="post" className="cap-cluster" data-align="end">
        <input type="hidden" name="intent" value="session-add-concurrent" />
        <input type="hidden" name="sessionId" value={source.id} />
        <div className="cap-grow cap-stack" data-gap="2">
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
        <div className="cap-grow cap-stack" data-gap="2">
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
    </Panel>
  );
}
