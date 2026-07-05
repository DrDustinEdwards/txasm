// Display helpers shared by routes and the print renderers. No data or server
// imports, so this is safe on both sides of the server/client boundary.

// Escape a plain-text value for safe insertion into HTML or SVG markup. The
// book, program, and cover renderers share this so plain fields (names, dates,
// titles) can never inject markup into the print document.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
