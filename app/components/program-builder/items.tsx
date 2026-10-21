import { Form } from "react-router";
import type {
  ProgramAbstractOption,
  ProgramSessionResolved,
} from "~/lib/data-access";
import { toDateTimeLocal } from "~/lib/format";
import { extractPlainText } from "~/lib/richtext";
import {
  programKindColor,
  programKindLabel,
  speakerRoleLabel,
} from "~/lib/vocab";
import {
  inputClass,
  KindSelect,
  smallButton,
  type SpeakerOption,
} from "./shared";

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
              {item.abstractCode ? (
                <span className="font-medium">{item.abstractCode} </span>
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
              className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
                  {option.code ? `${option.code} ` : ""}
                  {extractPlainText(option.title)}
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
