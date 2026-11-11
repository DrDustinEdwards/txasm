import { Form, useNavigation, useSubmit } from "react-router";
import { SortableList } from "capsomer/react/sortable-list";
// Capsomer's sortable list styles, loaded with the routes that use it rather than on every page.
import "capsomer/sortable-list.css";
import type { ProgramAbstractOption, ProgramSessionResolved } from "~/lib/data-access";
import { utcInputValue } from "capsomer/behavior/time";
import { richTextPlain } from "capsomer/behavior/rich-text-field";
import { Pill } from "capsomer/react/status";
import { programKindLabel, speakerRoleLabel } from "~/lib/vocab";
import { KindSelect, type SpeakerOption } from "./shared";
import { RichText } from "capsomer/react/trusted-html";

type Item = ProgramSessionResolved["items"][number];

const itemLabel = (item: Item) =>
  item.abstractId
    ? [item.abstractCode, richTextPlain(item.abstractTitle ?? "Abstract")].filter(Boolean).join(" ")
    : item.speakerId
      ? (item.speakerName ?? "Invited speaker")
      : (item.customTitle ?? programKindLabel(item.kind));

// A session's items in order, on Capsomer's SortableList: drag, the keyboard or Move up and Move down
// reorder them, and Remove deletes one. Each change posts to the program action (item-reorder,
// item-delete), and the list shows the posted order until the reloaded program arrives.
export function SessionItems({
  session,
  busy,
}: {
  session: ProgramSessionResolved;
  busy: boolean;
}) {
  const submit = useSubmit();
  const pending = useNavigation().formData;
  // A reorder is shown at once and saved behind it, so the list stays usable (and the pressed control keeps
  // focus) while it saves; any other save under way disables it.
  const listBusy = busy && pending?.get("intent") !== "item-reorder";
  let items: Item[] = session.items;
  if (pending?.get("sessionId") === session.id && pending.get("intent") === "item-reorder") {
    const order = pending.getAll("order").map(String);
    const byId = new Map(items.map((i) => [i.id, i]));
    items = order.flatMap((id) => byId.get(id) ?? []);
  } else if (pending?.get("intent") === "item-delete") {
    items = items.filter((i) => i.id !== pending.get("itemId"));
  }
  const post = (fields: [string, string][]) => {
    const body = new FormData();
    for (const [k, v] of fields) body.append(k, v);
    void submit(body, { method: "post", preventScrollReset: true });
  };
  return (
    <SortableList
      aria-label={`Items in ${session.title}`}
      items={items}
      getId={(item) => item.id}
      getLabel={itemLabel}
      busy={listBusy}
      empty={<p className="small cap-muted">No items in this session yet.</p>}
      onReorder={(order) =>
        post([
          ["intent", "item-reorder"],
          ["sessionId", session.id],
          ...order.map((id): [string, string] => ["order", id]),
        ])
      }
      onRemove={(id) =>
        post([
          ["intent", "item-delete"],
          ["itemId", id],
        ])
      }
      renderItem={(item) => <ItemBody item={item} busy={busy} />}
    />
  );
}

function ItemBody({ item, busy }: { item: Item; busy: boolean }) {
  const isCustom = item.abstractId === null && item.speakerId === null;
  return (
    <div className="cap-stack" data-gap="3">
      <div className="small">
        <Pill variant="secondary">{programKindLabel(item.kind)}</Pill>
        {item.abstractId ? (
          <p>
            {item.abstractCode ? <span className="strong">{item.abstractCode} </span> : null}
            <RichText as="span" html={item.abstractTitle} fallback="Abstract" />
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

      {/* A plain disclosure, as before: Capsomer's Disclosure has no unboxed variant for an inline "Edit item". */}
      <details>
        <summary className="summary tiny cap-muted">Edit item</summary>
        <Form method="post" className="cap-grid" data-cols="2">
          <input type="hidden" name="intent" value="item-update" />
          <input type="hidden" name="itemId" value={item.id} />
          <KindSelect id={`itemkind-${item.id}`} defaultValue={item.kind} />
          <div className="cap-stack" data-gap="2">
            <label htmlFor={`itemtime-${item.id}`} className="cap-field-label">
              Time
            </label>
            <input
              id={`itemtime-${item.id}`}
              name="startsAt"
              type="datetime-local"
              defaultValue={utcInputValue(item.startsAt)}
              className="cap-input"
            />
          </div>
          {isCustom ? (
            <div className="cap-stack span-2" data-gap="2">
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
          <div className="cap-stack span-2" data-gap="2">
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
    </div>
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
    <div className="cap-stack" data-gap="4">
      <Form method="post" className="card card-s cap-stack" data-gap="3">
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
                  {richTextPlain(option.title)}
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

      <Form method="post" className="card card-s cap-stack" data-gap="3">
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

      <Form method="post" className="card card-s cap-stack" data-gap="3">
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
