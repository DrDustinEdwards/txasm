import { Form } from "react-router";
import type { ProgramAbstractOption, ProgramSessionResolved } from "~/lib/data-access";
import { toDateTimeLocal } from "~/lib/format";
import { extractPlainText } from "~/lib/richtext";
import { Badge } from "capsomer/react/status";
import { programKindLabel, speakerRoleLabel } from "~/lib/vocab";
import { inputClass, KindSelect, type SpeakerOption } from "./shared";

export function ItemRow({
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
    <li className="card card-s">
      <div className="spread">
        <div className="small">
          <Badge variant="secondary">{programKindLabel(item.kind)}</Badge>
          {item.abstractId ? (
            <p>
              {item.abstractCode ? <span className="strong">{item.abstractCode} </span> : null}
              <span
                dangerouslySetInnerHTML={{
                  __html: item.abstractTitle ?? "Abstract",
                }}
              />
              {item.presentingAuthorName ? (
                <span className="cap-muted"> . {item.presentingAuthorName}</span>
              ) : null}
            </p>
          ) : item.speakerId ? (
            <p>
              <span className="strong">{item.speakerName ?? "Invited speaker"}</span>
              {item.speakerTalkTitle ? (
                <span className="cap-muted"> . {item.speakerTalkTitle}</span>
              ) : null}
            </p>
          ) : (
            <p className="strong">{item.customTitle}</p>
          )}
          {item.note ? <p className="cap-muted">{item.note}</p> : null}
        </div>
        <div className="cluster">
          <Form method="post">
            <input type="hidden" name="intent" value="item-move" />
            <input type="hidden" name="sessionId" value={session.id} />
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={busy || index === 0}
              aria-label="Move item up"
              className="cap-btn"
              data-size="sm"
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
              className="cap-btn"
              data-size="sm"
            >
              Down
            </button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="item-delete" />
            <input type="hidden" name="itemId" value={item.id} />
            <button type="submit" disabled={busy} className="link-button small strong">
              Remove
            </button>
          </Form>
        </div>
      </div>

      <details className="mt-2">
        <summary className="summary tiny cap-muted">Edit item</summary>
        <Form method="post" className="grid-2">
          <input type="hidden" name="intent" value="item-update" />
          <input type="hidden" name="itemId" value={item.id} />
          <KindSelect id={`itemkind-${item.id}`} defaultValue={item.kind} />
          <div className="stack-1">
            <label htmlFor={`itemtime-${item.id}`} className="cap-field-label">
              Time
            </label>
            <input
              id={`itemtime-${item.id}`}
              name="startsAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(item.startsAt)}
              className="cap-input"
            />
          </div>
          {isCustom ? (
            <div className="stack-1 span-2">
              <label htmlFor={`itemtitle-${item.id}`} className="cap-field-label">
                Title
              </label>
              <input
                id={`itemtitle-${item.id}`}
                name="customTitle"
                type="text"
                required
                defaultValue={item.customTitle ?? ""}
                className="cap-input"
              />
            </div>
          ) : null}
          <div className="stack-1 span-2">
            <label htmlFor={`itemnote-${item.id}`} className="cap-field-label">
              Note
            </label>
            <input
              id={`itemnote-${item.id}`}
              name="note"
              type="text"
              defaultValue={item.note ?? ""}
              className="cap-input"
            />
          </div>
          <div className="span-2">
            <button type="submit" disabled={busy} className="cap-btn" data-size="sm">
              Save item
            </button>
          </div>
        </Form>
      </details>
    </li>
  );
}

export function AddItemForms({
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
    <div className="stack-3">
      <Form method="post" className="card card-s stack-2">
        <input type="hidden" name="intent" value="item-add-abstract" />
        <input type="hidden" name="sessionId" value={session.id} />
        <label htmlFor={`add-abstract-${session.id}`} className="cap-field-label">
          Add an accepted abstract
        </label>
        {unplaced.length === 0 ? (
          <p className="small cap-muted">No unplaced accepted abstracts.</p>
        ) : (
          <>
            <select
              id={`add-abstract-${session.id}`}
              name="abstractId"
              defaultValue=""
              className="cap-select"
            >
              <option value="" disabled>
                Choose an abstract
              </option>
              {unplaced.map((option) => (
                <option key={option.abstractId} value={option.abstractId}>
                  {option.code ? `${option.code} ` : ""}
                  {extractPlainText(option.title)}
                  {option.presentingAuthorName ? ` (${option.presentingAuthorName})` : ""}
                </option>
              ))}
            </select>
            <KindSelect id={`add-abstract-kind-${session.id}`} defaultValue="talk" />
            <button type="submit" disabled={busy} className="cap-btn" data-size="sm">
              Add abstract
            </button>
          </>
        )}
      </Form>

      <Form method="post" className="card card-s stack-2">
        <input type="hidden" name="intent" value="item-add-speaker" />
        <input type="hidden" name="sessionId" value={session.id} />
        <label htmlFor={`add-speaker-${session.id}`} className="cap-field-label">
          Add an invited speaker
        </label>
        {speakers.length === 0 ? (
          <p className="small cap-muted">No invited speakers yet.</p>
        ) : (
          <>
            <select
              id={`add-speaker-${session.id}`}
              name="speakerId"
              defaultValue=""
              className="cap-select"
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
            <KindSelect id={`add-speaker-kind-${session.id}`} defaultValue="keynote" />
            <button type="submit" disabled={busy} className="cap-btn" data-size="sm">
              Add speaker
            </button>
          </>
        )}
      </Form>

      <Form method="post" className="card card-s stack-2">
        <input type="hidden" name="intent" value="item-add-custom" />
        <input type="hidden" name="sessionId" value={session.id} />
        <label htmlFor={`custom-title-${session.id}`} className="cap-field-label">
          Add a custom item
        </label>
        <input
          id={`custom-title-${session.id}`}
          name="customTitle"
          type="text"
          required
          placeholder="Break, lunch, poster session"
          className="cap-input"
        />
        <KindSelect id={`custom-kind-${session.id}`} defaultValue="other" />
        <input
          name="note"
          type="text"
          aria-label="Custom item note"
          placeholder="Optional note"
          className="cap-input"
        />
        <button type="submit" disabled={busy} className="cap-btn" data-size="sm">
          Add item
        </button>
      </Form>
    </div>
  );
}
