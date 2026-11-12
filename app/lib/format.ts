// Display helpers shared by routes and the print renderers. No data or server
// imports, so this is safe on both sides of the server/client boundary.

// How txasm shows a moment: "Nov 3, 2026, 2:00 PM UTC", in UTC so it matches what admins entered (Capsomer's
// formatDate, capsomer/behavior/time).
export const DATE_TIME = { style: "medium", time: true, zoneName: true } as const;

// The non-empty parts, trimmed, joined with ", ".
export function joinParts(parts: Array<string | null>): string {
  return parts
    .map((p) => (p ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join(", ");
}

// Escape a string for use inside a CSS string literal (a running header).
export function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
}

// A snake_case value as words: "abstract_book" becomes "Abstract Book".
export function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
