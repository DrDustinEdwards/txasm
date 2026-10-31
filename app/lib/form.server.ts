// Form bodies read to a ceiling (site-runtime's readCappedBytes), and the field parsers the admin actions share. Each
// parser throws ValidationError, in words for the admin, when a field does not parse.
import { readCappedBytes } from "@dustinedwards/site-runtime/body";
import { logEvent, OWASP_EVENTS, requestFields } from "@dustinedwards/site-runtime/log";
import { ValidationError } from "./data-access";

/** A form of text fields: sign-in, an abstract, a review, an admin setting. */
export const FORM_LIMIT = 1024 * 1024;

/**
 * The request's form, parsed from at most `max` bytes. Over it, the read throws a 413 for the route to answer with,
 * so no post is held in memory past what its route accepts.
 */
export async function readForm(request: Request, max = FORM_LIMIT): Promise<FormData> {
  const bytes = await readCappedBytes(request, max);
  if (!bytes) {
    logEvent(OWASP_EVENTS.inputValidationFailure, { ...requestFields(request), reason: `body over ${max} bytes` }, { level: "warn" });
    throw new Response("Payload Too Large", { status: 413, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { "Content-Type": request.headers.get("Content-Type") ?? "" } }).formData();
}

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
