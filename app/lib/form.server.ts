// Form field parsers the admin actions share. Each throws ValidationError, in
// words for the admin, when a field does not parse.
import { ValidationError } from "./data-access";

// A sort order: a whole number, 0 when the field is blank.
export function parseSortOrder(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "0").trim() || "0";
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError("Sort order must be a whole number.");
  }
  return n;
}

// A year: a whole number, null when the field is blank. `label` names the field.
export function parseYear(value: FormDataEntryValue | null, label = "Year"): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError(`${label} must be a whole number.`);
  }
  return n;
}
