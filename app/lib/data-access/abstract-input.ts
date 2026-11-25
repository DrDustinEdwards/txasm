import { ValidationError } from "./core";

// A text field from the form's JSON: a string, or nothing. Anything else (a
// number, an object) is refused before the save writes a row.
function textField(value: unknown, what: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ValidationError(`Could not read ${what}.`);
  return value.trim();
}

function listOf(value: unknown, what: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every((v) => v !== null && typeof v === "object")) {
    throw new ValidationError(`Could not read the ${what}.`);
  }
  return value as Record<string, unknown>[];
}

export function cleanAffiliations(input: unknown) {
  return listOf(input, "affiliations")
    .map((a, i) => {
      const what = `affiliation ${i + 1}`;
      return {
        institution: textField(a.institution, what),
        department: textField(a.department, what) || null,
        city: textField(a.city, what) || null,
        country: textField(a.country, what) || null,
      };
    })
    .filter((a) => a.institution.length > 0);
}

export function cleanAuthors(input: unknown) {
  return listOf(input, "authors")
    .map((a, i) => {
      const what = `author ${i + 1}`;
      const ordinals = a.affiliationOrdinals ?? [];
      if (!Array.isArray(ordinals) || !ordinals.every((n) => Number.isInteger(n))) {
        throw new ValidationError(`Could not read ${what}'s affiliations.`);
      }
      return {
        firstName: textField(a.firstName, what),
        lastName: textField(a.lastName, what),
        email: textField(a.email, what) || null,
        isPresenting: !!a.isPresenting,
        isCorresponding: !!a.isCorresponding,
        affiliationOrdinals: ordinals as number[],
      };
    })
    .filter((a) => a.firstName.length > 0 || a.lastName.length > 0);
}
