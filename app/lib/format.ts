// Display helpers shared by routes and the print renderers. No data or server
// imports, so this is safe on both sides of the server/client boundary.

// Money is stored in cents. Format to a currency string only for display.
export function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

// Cents to a plain dollars string for a number input value, e.g. 4500 to "45.00".
export function centsToDollarsInput(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

// A dollars string from a form back to integer cents. Returns null when the
// value is not a non-negative number.
export function parseDollarsToCents(value: string): number | null {
  const dollars = Number(value.trim());
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

// A timestamp to the value a datetime-local input expects, in UTC. The Worker
// runtime is UTC, so this round-trips with new Date(value) in actions.
export function toDateTimeLocal(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 16);
}

// A timestamp for display, in UTC so it matches what admins entered.
export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "";
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}

// The non-empty parts, trimmed, joined with ", ".
export function joinParts(parts: Array<string | null>): string {
  return parts
    .map((p) => (p ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join(", ");
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

// "May 1, 2026", or "May 1, 2026 to May 2, 2026", or "" with no dates.
export function formatMeetingDates(start: Date | null, end: Date | null): string {
  if (start && end) {
    if (start.getTime() === end.getTime()) return DATE_FMT.format(start);
    return `${DATE_FMT.format(start)} to ${DATE_FMT.format(end)}`;
  }
  if (start) return DATE_FMT.format(start);
  if (end) return DATE_FMT.format(end);
  return "";
}

// Escape a string for use inside a CSS string literal (a running header).
export function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
}
