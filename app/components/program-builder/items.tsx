import { Stack } from "capsomer/react/stack";
import { Form, useNavigation, useSubmit } from "react-router";
import { Disclosure } from "capsomer/react/disclosure";
import { Panel } from "capsomer/react/panel";
import { SortableList } from "capsomer/react/sortable-list";
import "capsomer/sortable-list.css";
import type { ProgramAbstractOption, ProgramSessionResolved } from "~/lib/data-access";
import { DateTimeField, TextField } from "capsomer/react/field";
import { richTextPlain } from "capsomer/behavior/rich-text-field";
import { Pill } from "capsomer/react/status";
import { programKindLabel, speakerRoleLabel } from "~/lib/vocab";
import { ProgramItemTitle } from "~/components/program-item-title";
import { KindSelect, type SpeakerOption } from "./shared";

type Item = ProgramSessionResolved["items"][number];

const itemLabel = (item: Item) =>
  item.abstractId
    ? [item.abstractCode, richTextPlain(item.abstractTitle ?? "Abstract")].filter(Boolean).join(" ")
    : item.speakerId
      ? (item.speakerName ?? "Invited speaker")
      : (item.customTitle ?? programKindLabel(item.kind));

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
      className="sort-rows"
      steps="labeled"
      grip={false}
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
      renderItem={(item) => <ItemBody item={item} />}
      renderFoot={(item) => <ItemEdit item={item} busy={busy} />}
    />
  );
}

function ItemBody({ item }: { item: Item }) {
  return (
    <div className="small">
      <Pill variant="secondary">{programKindLabel(item.kind)}</Pill>
      <ProgramItemTitle item={item} />
      {item.note ? <p className="cap-muted">{item.note}</p> : null}
    </div>
  );
}

function ItemEdit({ item, busy }: { item: Item; busy: boolean }) {
  const isCustom = item.abstractId === null && item.speakerId === null;
  return (
    <Disclosure summary="Edit item" variant="inline" size="sm">
      <Form method="post" className="cap-grid" data-cols="2">
        <input type="hidden" name="intent" value="item-update" />
        <input type="hidden" name="itemId" value={item.id} />
        <KindSelect id={`itemkind-${item.id}`} defaultValue={item.kind} />
        <DateTimeField
          id={`itemtime-${item.id}`}
          name="startsAt"
          label="Time"
          defaultDate={item.startsAt}
        />
        {isCustom ? (
          <div className="span-2">
            <TextField
              id={`itemtitle-${item.id}`}
              label="Title"
              name="customTitle"
              type="text"
              required
              defaultValue={item.customTitle ?? ""}
            />
          </div>
        ) : null}
        <div className="span-2">
          <TextField
            id={`itemnote-${item.id}`}
            label="Note"
            name="note"
            type="text"
            defaultValue={item.note ?? ""}
          />
        </div>
        <div className="span-2">
          <button type="submit" disabled={busy} className="cap-btn" data-size="sm">
            Save item
          </button>
        </div>
      </Form>
    </Disclosure>
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
    <Stack gap={4}>
      <Panel size="sm">
        <Stack as={Form} method="post" gap={3}>
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
        </Stack>
      </Panel>

      <Panel size="sm">
        <Stack as={Form} method="post" gap={3}>
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
        </Stack>
      </Panel>

      <Panel size="sm">
        <Stack as={Form} method="post" gap={3}>
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
        </Stack>
      </Panel>
    </Stack>
  );
}
