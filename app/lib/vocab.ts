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

const ABSTRACT_STATUSES = [
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
  "staff",
  "fellow",
  "faculty",
] as const;
export type AbstractLevel = (typeof ABSTRACT_LEVELS)[number];
export const ABSTRACT_LEVEL_LABELS: Record<AbstractLevel, string> = {
  undergraduate: "Undergraduate",
  graduate: "Graduate",
  education: "Education",
  high_school: "High school",
  postdoctoral: "Postdoctoral",
  staff: "Staff",
  fellow: "Fellow",
  faculty: "Faculty",
};

export const ABSTRACT_FORMATS = ["oral", "poster"] as const;
export type AbstractFormat = (typeof ABSTRACT_FORMATS)[number];
export const ABSTRACT_FORMAT_LABELS: Record<AbstractFormat, string> = {
  oral: "Oral",
  poster: "Poster",
};

// Book abstract code vocabulary. A code is a level letter plus a format letter
// plus a running number (for example UO1, GP3, PP2). These maps are the single
// source of the letters, so code generation never hardcodes them.
export const LEVEL_CODE_LETTERS: Record<AbstractLevel, string> = {
  undergraduate: "U",
  graduate: "G",
  education: "E",
  postdoctoral: "P",
  high_school: "H",
  staff: "S",
  fellow: "F",
  // Faculty thematic talks use category-based printed codes (e.g. ARM-1F); "L" is
  // the generated-code letter for faculty (F is taken by fellow).
  faculty: "L",
};
export const FORMAT_CODE_LETTERS: Record<AbstractFormat, string> = {
  oral: "O",
  poster: "P",
};

// A stored code is either a printed code lifted from the book or one this app
// generated deterministically from seed order. code_source keeps the two apart
// so a generated code is never presented as the printed record.
const CODE_SOURCES = ["printed", "generated"] as const;
export type CodeSource = (typeof CODE_SOURCES)[number];
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
export const CONFLICT_REASONS = [
  "author",
  "coauthor",
  "colleague",
  "other",
] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];
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

// The program day key for sessions with no date; the others are yyyy-mm-dd.
export const NO_DATE_KEY = "no-date";

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
const PROGRAM_ITEM_KIND_LABELS: Record<ProgramItemKind, string> = {
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
const SPEAKER_ROLE_LABELS: Record<SpeakerRole, string> = {
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
// Documents. One model for every branch PDF, generated or uploaded: newsletters,
// abstract books, programs, and anything else, optionally tied to a meeting.
// Category and status back the Drizzle enum columns on the document table; keep
// them in sync. genStatus (the generation lifecycle for generated docs) lives
// with the abstract statuses in spirit but is its own small set below.
// ---------------------------------------------------------------------------

export const DOCUMENT_CATEGORIES = [
  "newsletter",
  "abstract_book",
  "program",
  "brand_image",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  newsletter: "Newsletter",
  abstract_book: "Abstract book",
  program: "Program",
  // Internal value stays brand_image; only this label may be reworded.
  brand_image: "Brand images",
  other: "Other",
};

// Whether a stored document file is a PDF or an image. This is the branching key
// the viewer reads: PDFs render in the PDF.js viewer, images in a plain <img>.
// Stored per row (schema.document.fileKind), never inferred from category at read
// time, so a mis-categorized file still renders as what it actually is.
const DOCUMENT_FILE_KINDS = ["pdf", "image"] as const;
export type DocumentFileKind = (typeof DOCUMENT_FILE_KINDS)[number];

// Accepted upload MIME types. PDF for the publication categories; a fixed set of
// web-safe raster and vector images for brand_image. Validated server-side
// against the uploaded file's declared MIME, not its extension.
export const PDF_MIME_TYPE = "application/pdf";
export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

// The categories whose files are images; everything else is a PDF publication.
// The upload gate reads this to decide which MIME types to accept.
const IMAGE_DOCUMENT_CATEGORIES = ["brand_image"] as const;

export function isImageCategory(category: DocumentCategory): boolean {
  return (IMAGE_DOCUMENT_CATEGORIES as readonly string[]).includes(category);
}

export function allowedMimeTypesForCategory(
  category: DocumentCategory,
): readonly string[] {
  return isImageCategory(category) ? IMAGE_MIME_TYPES : [PDF_MIME_TYPE];
}

// Coarse kind from a stored MIME. Anything that is not the PDF type is an image
// (the accepted set is already gated at upload), so this stays correct as image
// formats are added to IMAGE_MIME_TYPES.
export function fileKindForMime(mime: string): DocumentFileKind {
  return mime === PDF_MIME_TYPE ? "pdf" : "image";
}

// File extension for the R2 object key and the download filename, by MIME, so the
// stored key and Content-Disposition name stay honest about the real format.
const MIME_EXTENSIONS: Record<string, string> = {
  [PDF_MIME_TYPE]: "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};
export function extensionForMime(mime: string): string {
  return MIME_EXTENSIONS[mime] ?? "bin";
}

// Upload size ceilings, per kind. Brand images are logos and marks, so a tight
// cap is fine; PDFs (scanned newsletters, abstract books) need room.
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PDF_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
export function maxUploadBytesForKind(kind: DocumentFileKind): number {
  return kind === "image" ? MAX_IMAGE_UPLOAD_BYTES : MAX_PDF_UPLOAD_BYTES;
}

export const DOCUMENT_STATUSES = ["draft", "published"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
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

// Sections of the branch officers page, in page order.
export const OFFICER_SECTIONS = ["officer", "board", "past"] as const;
export type OfficerSection = (typeof OFFICER_SECTIONS)[number];

export const OFFICER_SECTION_LABELS: Record<OfficerSection, string> = {
  officer: "Current officers",
  board: "Advisory board",
  past: "Past officers",
};
