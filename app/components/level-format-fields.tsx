import { Field } from "capsomer/react/field";
import {
  ABSTRACT_FORMATS,
  ABSTRACT_FORMAT_LABELS,
  ABSTRACT_LEVELS,
  ABSTRACT_LEVEL_LABELS,
} from "~/lib/vocab";

export function LevelFormatFields({ level, format }: { level?: string; format?: string }) {
  return (
    <>
      <Field label="Level">
        <select id="level" name="level" defaultValue={level} className="cap-select">
          <option value="">All levels</option>
          {ABSTRACT_LEVELS.map((l) => (
            <option key={l} value={l}>
              {ABSTRACT_LEVEL_LABELS[l]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Format">
        <select id="format" name="format" defaultValue={format} className="cap-select">
          <option value="">All formats</option>
          {ABSTRACT_FORMATS.map((f) => (
            <option key={f} value={f}>
              {ABSTRACT_FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
