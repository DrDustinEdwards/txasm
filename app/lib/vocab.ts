// The single source of truth for every controlled vocabulary and tunable
// default in the app (house rule: no hardcoding, no scattered magic strings).
// Each set is a readonly array plus its union type plus a label map, so routes,
// components, and the data-access layer reference these instead of retyping
// string literals. This module imports nothing server-only, so it is safe on
// both sides of the boundary. The Drizzle enum columns in app/db/schema.ts must
// stay in sync with the arrays here.

// ---------------------------------------------------------------------------
// Tunable defaults. Named config, never bare numbers in the code.
// ---------------------------------------------------------------------------

export const DEFAULT_WORD_LIMIT = 250;
export const DEFAULT_CURRENCY = "usd";

// ---------------------------------------------------------------------------
// Editions.
// ---------------------------------------------------------------------------

export const SEASONS = ["spring", "fall"] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_LABELS: Record<Season, string> = {
  spring: "Spring",
  fall: "Fall",
};

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
export const EDITION_STATUS_LABELS: Record<EditionStatus, string> = {
  draft: "Draft",
  registration_open: "Registration open",
  submission_open: "Submission open",
  review: "Review",
  decisions: "Decisions",
  scheduled: "Scheduled",
  complete: "Complete",
  archived: "Archived",
};

// ---------------------------------------------------------------------------
// Abstracts: status, level (presenter standing), format, presentation preference.
// ---------------------------------------------------------------------------

export const ABSTRACT_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
export type AbstractStatus = (typeof ABSTRACT_STATUSES)[number];
export const ABSTRACT_STATUS_LABELS: Record<AbstractStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const ABSTRACT_LEVELS = [
  "undergraduate",
  "graduate",
  "education",
  "high_school",
  "postdoctoral",
] as const;
export type AbstractLevel = (typeof ABSTRACT_LEVELS)[number];
export const ABSTRACT_LEVEL_LABELS: Record<AbstractLevel, string> = {
  undergraduate: "Undergraduate",
  graduate: "Graduate",
  education: "Education",
  high_school: "High school",
  postdoctoral: "Postdoctoral",
};

export const ABSTRACT_FORMATS = ["oral", "poster"] as const;
export type AbstractFormat = (typeof ABSTRACT_FORMATS)[number];
export const ABSTRACT_FORMAT_LABELS: Record<AbstractFormat, string> = {
  oral: "Oral",
  poster: "Poster",
};

export const PRESENTATION_PREFERENCES = ["oral", "poster", "either"] as const;
export type PresentationPreference = (typeof PRESENTATION_PREFERENCES)[number];
export const PRESENTATION_PREFERENCE_LABELS: Record<
  PresentationPreference,
  string
> = {
  oral: "Oral",
  poster: "Poster",
  either: "Either",
};

// The decided oral/poster placement on an accepted abstract. Same values as the
// format, kept as its own name for the decision and program domains.
export const PRESENTATION_TYPES = ["oral", "poster"] as const;
export type PresentationType = (typeof PRESENTATION_TYPES)[number];
export const PRESENTATION_TYPE_LABELS: Record<PresentationType, string> = {
  oral: "Oral",
  poster: "Poster",
};

// ---------------------------------------------------------------------------
// Registration.
// ---------------------------------------------------------------------------

export const REGISTRATION_CATEGORY_KEYS = [
  "member",
  "student",
  "nonmember",
] as const;
export type RegistrationCategoryKey =
  (typeof REGISTRATION_CATEGORY_KEYS)[number];
export const REGISTRATION_CATEGORY_KEY_LABELS: Record<
  RegistrationCategoryKey,
  string
> = {
  member: "Member",
  student: "Student",
  nonmember: "Nonmember",
};

// ---------------------------------------------------------------------------
// Review and decisions.
// ---------------------------------------------------------------------------

export const REVIEW_RECOMMENDATIONS = ["accept", "reject", "revise"] as const;
export type ReviewRecommendation = (typeof REVIEW_RECOMMENDATIONS)[number];
export const REVIEW_RECOMMENDATION_LABELS: Record<
  ReviewRecommendation,
  string
> = {
  accept: "Accept",
  reject: "Reject",
  revise: "Revise",
};

export const CONFLICT_REASONS = [
  "author",
  "coauthor",
  "colleague",
  "other",
] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];
export const CONFLICT_REASON_LABELS: Record<ConflictReason, string> = {
  author: "Author",
  coauthor: "Co-author",
  colleague: "Colleague",
  other: "Other",
};

export const DECISION_OUTCOMES = ["accept", "reject", "revise"] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];
export const DECISION_OUTCOME_LABELS: Record<DecisionOutcome, string> = {
  accept: "Accepted",
  reject: "Rejected",
  revise: "Revise and resubmit",
};

// ---------------------------------------------------------------------------
// Program items and invited speakers.
// ---------------------------------------------------------------------------

export const PROGRAM_ITEM_KINDS = [
  "talk",
  "poster",
  "keynote",
  "award",
  "meal",
  "break",
  "business",
  "social",
  "panel",
  "networking",
  "career",
  "other",
] as const;
export type ProgramItemKind = (typeof PROGRAM_ITEM_KINDS)[number];
export const PROGRAM_ITEM_KIND_LABELS: Record<ProgramItemKind, string> = {
  talk: "Talk",
  poster: "Poster",
  keynote: "Keynote",
  award: "Award Lecture",
  meal: "Meal",
  break: "Break",
  business: "Business Meeting",
  social: "Social",
  panel: "Panel",
  networking: "Networking",
  career: "Career",
  other: "Other",
};
export function programKindLabel(kind: ProgramItemKind): string {
  return PROGRAM_ITEM_KIND_LABELS[kind] ?? "Other";
}

export const SPEAKER_ROLES = [
  "keynote",
  "goldschmidt_lecture",
  "award_lecture",
  "career",
  "other",
] as const;
export type SpeakerRole = (typeof SPEAKER_ROLES)[number];
export const SPEAKER_ROLE_LABELS: Record<SpeakerRole, string> = {
  keynote: "Keynote",
  goldschmidt_lecture: "Goldschmidt Lecture",
  award_lecture: "Award Lecture",
  career: "Career",
  other: "Other",
};
export function speakerRoleLabel(role: SpeakerRole | null): string {
  return role ? SPEAKER_ROLE_LABELS[role] ?? "Other" : "";
}

// ---------------------------------------------------------------------------
// Sponsors. Tier is stored as free text so a meeting can name its own; these are
// the suggested tiers offered in the admin form, centralized rather than typed
// inline. Not a DB enum.
// ---------------------------------------------------------------------------

export const SPONSOR_TIERS = [
  "Platinum",
  "Gold",
  "Silver",
  "Bronze",
  "Partner",
] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];
