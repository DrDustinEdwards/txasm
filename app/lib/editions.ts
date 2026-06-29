// Edition enums and labels shared by the data-access layer and the UI. This
// module imports nothing server-only, so route components can use the constant
// (for select options) without pulling the Drizzle client into the client
// bundle. The data-access layer imports these too, keeping one source.

export type Season = "spring" | "fall";

export const EDITION_STATUSES = [
  "draft",
  "registration_open",
  "submission_open",
  "review",
  "decisions",
  "scheduled",
  "complete",
  "archived",
] as const;

export type EditionStatus = (typeof EDITION_STATUSES)[number];
