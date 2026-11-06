import type { DataAccess, ProgramItemKind } from "~/lib/data-access";
import { PROGRAM_ITEM_KINDS, programKindLabel } from "~/lib/vocab";

export type SpeakerOption = Pick<
  Awaited<ReturnType<DataAccess["invitedSpeakers"]["listForEdition"]>>[number],
  "id" | "name" | "role" | "talkTitle"
>;

export function KindSelect({
  id,
  defaultValue,
  label = "Kind",
}: {
  id: string;
  defaultValue: ProgramItemKind;
  label?: string;
}) {
  return (
    <div className="stack-1">
      <label htmlFor={id} className="cap-field-label">
        {label}
      </label>
      <select id={id} name="kind" defaultValue={defaultValue} className="cap-select">
        {PROGRAM_ITEM_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {programKindLabel(kind)}
          </option>
        ))}
      </select>
    </div>
  );
}
