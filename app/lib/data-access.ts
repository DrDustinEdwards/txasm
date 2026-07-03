import { and, asc, desc, eq, inArray, like, ne, or } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getDb } from "../db/index.server";
import {
  ABSTRACT_FORMATS,
  ABSTRACT_LEVELS,
  CONFLICT_REASONS,
  DECISION_OUTCOMES,
  DEFAULT_CURRENCY,
  DEFAULT_WORD_LIMIT,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  EDITION_STATUSES,
  PROGRAM_ITEM_KINDS,
  REGISTRATION_CATEGORY_KEYS,
  REVIEW_RECOMMENDATIONS,
  SEASONS,
  SPEAKER_ROLES,
  type AbstractFormat,
  type AbstractLevel,
  type ConflictReason,
  type DecisionOutcome,
  type DocumentCategory,
  type DocumentStatus,
  type EditionStatus,
  type PresentationType,
  type ProgramItemKind,
  type RegistrationCategoryKey,
  type Season,
  type SpeakerRole,
} from "./vocab";
import {
  countWords,
  extractPlainText,
  isEmptyRichText,
  sanitizeBody,
  sanitizeTitle,
} from "./richtext";

// Default hard word limit for the abstract body when a meeting sets none. Named
// config lives in ./vocab; this alias keeps the existing call sites.
export const DEFAULT_BODY_WORD_LIMIT = DEFAULT_WORD_LIMIT;

// This file is the only place allowed to import ./schema and the Drizzle client.
// Enforce with an eslint no-restricted-imports rule on every other module so
// nothing queries Drizzle directly outside this layer.

type DB = DrizzleD1Database<typeof schema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
export class DeadlinePassedError extends Error {
  constructor(message = "deadline passed") {
    super(message);
    this.name = "DeadlinePassedError";
  }
}
export class ConflictOfInterestError extends Error {
  constructor(message = "reviewer has a conflict of interest") {
    super(message);
    this.name = "ConflictOfInterestError";
  }
}
export class NotFoundError extends Error {
  constructor(message = "not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
export class ValidationError extends Error {
  constructor(message = "invalid input") {
    super(message);
    this.name = "ValidationError";
  }
}
export class AlreadyExistsError extends Error {
  constructor(message = "already exists") {
    super(message);
    this.name = "AlreadyExistsError";
  }
}

// ---------------------------------------------------------------------------
// Actor and authorization helpers. Grants are loaded once per request.
// author and attendee are not roles; they are derived from ownership and a paid
// registration, checked inline where they matter.
// ---------------------------------------------------------------------------

export type Role = "admin" | "chair" | "reviewer";

export interface Grant {
  role: Role;
  editionId: string | null; // null = platform-wide
}

export interface Actor {
  userId: string;
  grants: Grant[];
}

export async function loadActor(db: DB, userId: string): Promise<Actor> {
  const rows = await db
    .select({ role: schema.roleGrant.role, editionId: schema.roleGrant.editionId })
    .from(schema.roleGrant)
    .where(
      and(
        eq(schema.roleGrant.userId, userId),
        eq(schema.roleGrant.status, "active"),
      ),
    );
  return { userId, grants: rows as Grant[] };
}

export function isAdmin(actor: Actor): boolean {
  return actor.grants.some((g) => g.role === "admin" && g.editionId === null);
}
export function isChair(actor: Actor, editionId: string): boolean {
  return (
    isAdmin(actor) ||
    actor.grants.some((g) => g.role === "chair" && g.editionId === editionId)
  );
}
export function isReviewer(actor: Actor, editionId: string): boolean {
  return actor.grants.some(
    (g) => g.role === "reviewer" && g.editionId === editionId,
  );
}
// True when the actor holds a reviewer grant in any edition. Used only to decide
// whether to show the Review link in the header; per-edition access is still
// checked with isReviewer everywhere it matters.
export function isReviewerAnywhere(actor: Actor): boolean {
  return actor.grants.some((g) => g.role === "reviewer");
}

// ---------------------------------------------------------------------------
// Module contracts. Every function takes the acting Actor first. The
// security-critical functions are implemented in full below; the rest are
// declared as signatures so the contract can be reviewed before the bodies
// are written.
// ---------------------------------------------------------------------------

// The three organizing axes: topic (categoryId), level, and format. bodyText is
// the single freeform body. The four section fields are still accepted for now
// but are optional and unused by default. The level and format vocabularies live
// in ./vocab and are imported above.
export interface AbstractInput {
  editionId: string;
  title: string;
  categoryId?: string; // topic axis
  level?: AbstractLevel | null;
  format?: AbstractFormat | null;
  bodyText?: string;
  background?: string;
  methods?: string;
  results?: string;
  conclusions?: string;
  presentationPreference?: "oral" | "poster" | "either";
}

export interface ReviewSubmission {
  assignmentId: string;
  recommendation: "accept" | "reject" | "revise";
  scores: Array<{ criterionId: string; score: number }>;
  overallComment?: string;
  confidentialComment?: string;
}

export type GrantableRole = "chair" | "reviewer";

export interface RoleGrantInput {
  editionId: string;
  email: string;
  role: GrantableRole;
}

export interface RoleRevokeInput {
  editionId: string;
  userId: string;
  role: GrantableRole;
}

// ConflictReason, the review recommendations, DecisionOutcome, and
// PresentationType vocabularies live in ./vocab and are imported above.

export interface DecisionInput {
  abstractId: string;
  outcome: DecisionOutcome;
  presentationType?: PresentationType | null;
  decisionMessage?: string;
}

// The assembled abstract-book data. getBookData returns this and the pure
// renderBook in ./book turns it into HTML, so the template is a function of the
// data. Title and body fields hold the stored sanitized HTML (em/sup/sub only)
// and are rendered as-is; do not re-parse them.
export interface BookAuthor {
  firstName: string;
  lastName: string;
  isPresenting: boolean;
  isCorresponding: boolean;
  affiliationOrdinals: number[]; // superscript numbers on the author line
}

export interface BookAffiliation {
  ordinal: number;
  institution: string;
  department: string | null;
  city: string | null;
  country: string | null;
}

export interface BookAbstract {
  number: number; // stable 1..n sequence across the whole book
  title: string; // sanitized HTML
  background: string | null;
  methods: string | null;
  results: string | null;
  conclusions: string | null;
  bodyText: string | null; // fallback when the structured sections are empty
  presentationType: PresentationType | null;
  authors: BookAuthor[];
  affiliations: BookAffiliation[];
  presentingAuthorName: string | null; // for the table of contents
}

export interface BookCategory {
  id: string | null; // null is the uncategorized group
  name: string;
  abstracts: BookAbstract[];
}

export interface BookIndexEntry {
  name: string; // "First Last" for display
  numbers: number[]; // abstract numbers this author appears on
}

export interface BookData {
  edition: {
    name: string;
    season: Season;
    year: number;
    meetingStartsAt: Date | null;
    meetingEndsAt: Date | null;
    venueName: string | null;
    city: string | null;
  };
  categories: BookCategory[];
  authorIndex: BookIndexEntry[];
  abstractCount: number;
}

// The submission form sends the whole author and affiliation lists; the
// data-access layer replaces them as a set, assigning ordinals by position.
export interface AuthorInput {
  firstName: string;
  lastName: string;
  email?: string;
  isPresenting?: boolean;
  isCorresponding?: boolean;
  affiliationOrdinals?: number[]; // which affiliation numbers attach to this author
}

export interface AffiliationInput {
  institution: string;
  department?: string;
  city?: string;
  country?: string;
}

// The controlled-vocabulary types live in ./vocab (client-safe, one source).
// Re-export the ones callers reach for through the data-access layer so their
// imports keep resolving here.
export type {
  AbstractFormat,
  AbstractLevel,
  ConflictReason,
  DecisionOutcome,
  EditionStatus,
  PresentationType,
  ProgramItemKind,
  RegistrationCategoryKey,
  Season,
  SpeakerRole,
} from "./vocab";

export interface EditionInput {
  name: string;
  season: Season;
  year: number;
  status?: EditionStatus;
}

// Edition edit patch. Only the registration and submission windows and the
// lifecycle status are editable here. Dates are optional; null clears a date.
export interface EditionPatch {
  status?: EditionStatus;
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
  submissionOpensAt?: Date | null;
  submissionDeadline?: Date | null;
}

export interface RegistrationCategoryInput {
  editionId: string;
  key: RegistrationCategoryKey;
  label: string;
  amountCents: number; // money is stored in cents, formatted to dollars in the UI
  currency?: string;
  sortOrder?: number;
}

export interface RegistrationCategoryPatch {
  label?: string;
  amountCents?: number;
  currency?: string;
  sortOrder?: number;
  active?: boolean;
}

function assertAmountCents(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new ValidationError("Fee must be a whole, non-negative number of cents.");
  }
}

function normalizeCurrency(currency?: string) {
  const value = currency?.trim().toLowerCase();
  return value && value.length > 0 ? value : DEFAULT_CURRENCY;
}

// Institution dedup key: lowercased, trimmed, whitespace collapsed, and LIKE
// wildcards removed so it is safe to interpolate into a search pattern. The seed
// and the ensure path use this same function so the unique index lines up.
export function normalizeInstitutionName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[%_]/g, "");
}

// ---------------------------------------------------------------------------
// Program (schedule) types. Sessions hold items; an item is either an accepted
// abstract or a custom entry. Resolved shapes carry what both the admin builder
// and the public view need; titles are stored sanitized HTML, plain text fields
// are escaped at render time.
// ---------------------------------------------------------------------------

export interface ProgramSessionInput {
  editionId: string;
  title: string;
  sessionDate?: Date | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  location?: string | null;
  moderator?: string | null;
}

export interface ProgramSessionPatch {
  title?: string;
  sessionDate?: Date | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  location?: string | null;
  moderator?: string | null;
}

// The ProgramItemKind vocabulary lives in ./vocab (imported above). Validate a
// raw kind string against it before writing.
function assertKind(kind: string): ProgramItemKind {
  if (!PROGRAM_ITEM_KINDS.includes(kind as ProgramItemKind)) {
    throw new ValidationError("Choose a valid item kind.");
  }
  return kind as ProgramItemKind;
}

export interface ProgramItemPatch {
  kind?: ProgramItemKind;
  customTitle?: string;
  note?: string | null;
  startsAt?: Date | null;
}

export interface ProgramItemResolved {
  id: string;
  kind: ProgramItemKind;
  sortOrder: number;
  startsAt: Date | null;
  note: string | null;
  abstractId: string | null;
  abstractNumber: number | null; // matches the abstract book numbering
  abstractTitle: string | null; // sanitized HTML
  presentingAuthorName: string | null;
  speakerId: string | null;
  speakerName: string | null; // plain text
  speakerTalkTitle: string | null; // plain text
  customTitle: string | null; // plain text
}

export interface ProgramSessionResolved {
  id: string;
  title: string;
  sessionDate: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
  moderator: string | null; // plain text, escaped at render time
  sortOrder: number;
  items: ProgramItemResolved[];
}

export interface ProgramAbstractOption {
  abstractId: string;
  number: number;
  title: string; // sanitized HTML
  presentingAuthorName: string | null;
}

// A concurrent group of sessions: one session on its own, or several running at
// the same time as parallel tracks. The public program renders each group as a
// row of tracks so overlapping sessions are not flattened into one timeline.
export interface ProgramTrackGroup {
  concurrent: boolean;
  sessions: ProgramSessionResolved[];
}

export interface ProgramDay {
  key: string; // yyyy-mm-dd, or "no-date" for sessions with no date
  date: Date | null;
  groups: ProgramTrackGroup[];
}

export interface PublicProgram {
  days: ProgramDay[];
  sponsors: SponsorPublic[];
  speakers: SpeakerPublic[];
}

// The chair/admin builder view of the schedule: the same day-and-concurrency
// grouping the public program uses, plus the meeting date range so the builder
// can offer a day tab for every meeting day even before a session exists on it.
export interface ProgramSchedule {
  days: ProgramDay[];
  meetingStartsAt: Date | null;
  meetingEndsAt: Date | null;
}

// Everything the printable program document needs, assembled by
// program.getProgramData and turned into HTML by the pure renderProgramBook in
// ./program-book. Front matter comes from the edition and platform settings;
// title and bio fields hold stored sanitized HTML rendered verbatim, plain text
// (rooms, moderators, names) is escaped by the renderer.
export interface ProgramBookData {
  meeting: {
    name: string;
    meetingStartsAt: Date | null;
    meetingEndsAt: Date | null;
    venueName: string | null;
    city: string | null;
    orgName: string;
    orgFullName: string;
    shortName: string;
  };
  days: ProgramDay[];
  speakers: SpeakerPublic[];
  sponsors: SponsorPublic[];
}

// Group resolved sessions by day, then within a day into concurrent track
// groups. Sessions with overlapping [startsAt, endsAt) run in parallel; sessions
// with no time each stand alone. Days are chronological with the no-date bucket
// last, and parallel tracks within a group are ordered by location.
function groupSessionsIntoDays(
  sessions: ProgramSessionResolved[],
): ProgramDay[] {
  const byDay = new Map<
    string,
    { date: Date | null; sessions: ProgramSessionResolved[] }
  >();
  for (const s of sessions) {
    const d = s.sessionDate ?? s.startsAt ?? null;
    const key = d ? d.toISOString().slice(0, 10) : "no-date";
    const bucket = byDay.get(key) ?? { date: d, sessions: [] };
    bucket.sessions.push(s);
    byDay.set(key, bucket);
  }

  const keys = [...byDay.keys()].sort((a, b) => {
    if (a === "no-date") return 1;
    if (b === "no-date") return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  return keys.map((key) => {
    const day = byDay.get(key)!;
    const sorted = [...day.sessions].sort((a, b) => {
      const at = a.startsAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = b.startsAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return at - bt || a.sortOrder - b.sortOrder;
    });

    const groups: ProgramTrackGroup[] = [];
    let current: ProgramSessionResolved[] | null = null;
    let groupEnd = Number.NEGATIVE_INFINITY;
    for (const s of sorted) {
      const start = s.startsAt?.getTime() ?? null;
      const end = s.endsAt?.getTime() ?? start;
      if (current && start !== null && start < groupEnd) {
        current.push(s);
        if (end !== null && end > groupEnd) groupEnd = end;
      } else {
        current = [s];
        groups.push({ concurrent: false, sessions: current });
        groupEnd = end ?? Number.NEGATIVE_INFINITY;
      }
    }

    for (const g of groups) {
      g.concurrent = g.sessions.length > 1;
      if (g.concurrent) {
        g.sessions.sort(
          (a, b) =>
            (a.location ?? "").localeCompare(b.location ?? "") ||
            a.sortOrder - b.sortOrder,
        );
      }
    }

    return { key, date: day.date, groups };
  });
}

// Edition stages at which the program is public. scheduled and complete are the
// active late stages; archived meetings keep a public program for the archive
// (CLAUDE.md: keep historical editions queryable).
const PROGRAM_PUBLIC_STATUSES: readonly EditionStatus[] = [
  "scheduled",
  "complete",
  "archived",
];

// ---------------------------------------------------------------------------
// Invited speakers and sponsors. Both are per-edition and chair/admin managed.
// Speaker bios are sanitized to the abstract body allowlist (em/sup/sub); the
// remaining text fields are plain and escaped at render time. Image r2 keys stay
// out of the write path for now (upload UI is deferred).
// ---------------------------------------------------------------------------

// The SpeakerRole vocabulary lives in ./vocab and is imported above.
export interface InvitedSpeakerInput {
  editionId: string;
  name: string;
  affiliation?: string | null;
  role?: SpeakerRole | null;
  talkTitle?: string | null;
  bio?: string; // sanitized to em/sup/sub on write
  sortOrder?: number;
}

export interface InvitedSpeakerPatch {
  name?: string;
  affiliation?: string | null;
  role?: SpeakerRole | null;
  talkTitle?: string | null;
  bio?: string;
  sortOrder?: number;
}

export interface SponsorInput {
  editionId: string;
  name: string;
  tier?: string | null;
  url?: string | null;
  sortOrder?: number;
}

export interface SponsorPatch {
  name?: string;
  tier?: string | null;
  url?: string | null;
  sortOrder?: number;
}

// Public sponsor shape for the program page. Plain text, escaped at render time.
export interface SponsorPublic {
  id: string;
  name: string;
  tier: string | null;
  url: string | null;
  logoR2Key: string | null;
}

// Public invited-speaker shape for the program page. name, affiliation, and
// talkTitle are plain text escaped at render time; bio is stored sanitized HTML.
export interface SpeakerPublic {
  id: string;
  name: string;
  affiliation: string | null;
  role: SpeakerRole | null;
  talkTitle: string | null;
  bio: string | null;
}

// ---------------------------------------------------------------------------
// Awards. Definition and recipient inputs. namesakeBio/description are sanitized
// to the abstract body allowlist (em/sup/sub) on write. A recipient always has a
// personName and a year; everything else is optional. editionId ties a recipient
// to the meeting where the award was given when that meeting is in the system.
// ---------------------------------------------------------------------------

export interface AwardInput {
  slug: string;
  name: string;
  namesakeBio?: string | null;
  description?: string | null;
  sortOrder?: number;
}

export interface AwardPatch {
  slug?: string;
  name?: string;
  namesakeBio?: string | null;
  description?: string | null;
  sortOrder?: number;
}

export interface AwardRecipientInput {
  awardId: string;
  editionId?: string | null;
  year: string;
  category?: string | null;
  placement?: string | null;
  personName: string;
  institution?: string | null;
  mentor?: string | null;
  sortOrder?: number;
}

export interface AwardRecipientPatch {
  editionId?: string | null;
  year?: string;
  category?: string | null;
  placement?: string | null;
  personName?: string;
  institution?: string | null;
  mentor?: string | null;
  sortOrder?: number;
}

// Free-text term plus optional exact/loose filters for the public awardee
// search. All values are bound as query parameters, never interpolated.
export interface AwardSearchFilters {
  awardSlug?: string;
  year?: string;
  institution?: string;
}

// One recipient row grouped under a category within a year on the award page.
export interface AwardRecipientView {
  id: string;
  year: string;
  category: string | null;
  placement: string | null;
  personName: string;
  institution: string | null;
  mentor: string | null;
  editionId: string | null;
}

export interface AwardYearGroup {
  year: string;
  categories: Array<{
    category: string | null;
    recipients: AwardRecipientView[];
  }>;
}

// A search hit: the recipient plus the award it belongs to, for linking back.
export interface AwardSearchResult extends AwardRecipientView {
  awardSlug: string;
  awardName: string;
}

// Normalize an award slug to the live-site shape: lowercase, spaces and runs of
// non-alphanumerics collapsed to single hyphens, trimmed of leading/trailing
// hyphens. Keeps seed slugs and admin-entered slugs consistent.
function normalizeAwardSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Documents. Helpers and shapes for the one-model-for-every-PDF layer, shared by
// the generate-record flow (source "generated") and the uploaded archive
// (source "uploaded").
// ---------------------------------------------------------------------------

// Same slug shape as awards: lowercase, non-alphanumerics collapsed to hyphens.
function normalizeDocumentSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertDocumentCategory(value: string): DocumentCategory {
  if (!DOCUMENT_CATEGORIES.includes(value as DocumentCategory)) {
    throw new ValidationError("Choose a valid document category.");
  }
  return value as DocumentCategory;
}

// Writes to a document are allowed for a platform admin, or a chair of the
// meeting the document belongs to. A document with no meeting (a newsletter) is
// admin-only.
function assertDocumentWrite(actor: Actor, editionId: string | null): void {
  if (isAdmin(actor)) return;
  if (editionId && isChair(actor, editionId)) return;
  throw new ForbiddenError();
}

// Deterministic slug/title/front matter for a generated document, one per
// category per edition. The edition slug keeps the archive URL readable.
function generatedDocMeta(
  category: DocumentCategory,
  ed: { slug: string; name: string; year: number; season: Season },
): { slug: string; title: string; year: number; season: Season } {
  const isBook = category === "abstract_book";
  return {
    slug: `${ed.slug}-${isBook ? "abstract-book" : "program"}`,
    title: `${ed.name} ${isBook ? "Abstract Book" : "Program"}`,
    year: ed.year,
    season: ed.season,
  };
}

export interface DocumentUploadInput {
  category: DocumentCategory;
  title: string;
  year?: number | null;
  season?: Season | null;
  editionId?: string | null;
  editor?: string | null;
  r2Key?: string | null;
  fileName?: string | null;
  slug?: string;
  sortOrder?: number;
}

export interface DocumentPatch {
  category?: DocumentCategory;
  status?: DocumentStatus;
  title?: string;
  year?: number | null;
  season?: Season | null;
  editionId?: string | null;
  editor?: string | null;
  r2Key?: string | null;
  fileName?: string | null;
  slug?: string;
  sortOrder?: number;
}

// Group flat recipient rows into years, then categories within each year,
// preserving the stored sortOrder (rows arrive pre-sorted). A null category
// keeps its own bucket so uncategorized awards render as a plain list.
function groupRecipientsByYear(
  rows: AwardRecipientView[],
): AwardYearGroup[] {
  const years: AwardYearGroup[] = [];
  const yearIndex = new Map<string, AwardYearGroup>();
  for (const row of rows) {
    let group = yearIndex.get(row.year);
    if (!group) {
      group = { year: row.year, categories: [] };
      yearIndex.set(row.year, group);
      years.push(group);
    }
    const key = row.category ?? "";
    let bucket = group.categories.find((c) => (c.category ?? "") === key);
    if (!bucket) {
      bucket = { category: row.category, recipients: [] };
      group.categories.push(bucket);
    }
    bucket.recipients.push(row);
  }
  return years;
}

// Sanitize an award's namesake bio or description to the abstract body allowlist
// (em/sup/sub), collapsing an empty result to null so blank fields do not store
// stray markup.
function sanitizeAwardHtml(value: string | null | undefined): string | null {
  if (value == null) return null;
  const html = sanitizeBody(value);
  return isEmptyRichText(html) ? null : html;
}

// A recipient write is allowed for a platform admin, or for a chair of the
// edition the recipient is tied to. A recipient with no edition is admin-only.
function requireRecipientWriter(actor: Actor, editionId: string | null): void {
  if (isAdmin(actor)) return;
  if (editionId && isChair(actor, editionId)) return;
  throw new ForbiddenError();
}

// Validate and normalize a new recipient's fields (personName and year required).
function validateRecipient(input: AwardRecipientInput) {
  const personName = input.personName.trim();
  if (!personName) throw new ValidationError("Recipient name is required.");
  const year = input.year.trim();
  if (!year) throw new ValidationError("Year is required.");
  return {
    editionId: input.editionId ?? null,
    year,
    category: input.category?.trim() || null,
    placement: input.placement?.trim() || null,
    personName,
    institution: input.institution?.trim() || null,
    mentor: input.mentor?.trim() || null,
    sortOrder: input.sortOrder ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Platform settings. A single row of org identity and tunable defaults, read by
// the shell and edited on the admin settings screen. footerLinks is stored as a
// JSON array and returned parsed. The single row is enforced by a fixed id.
// ---------------------------------------------------------------------------

export const PLATFORM_SETTINGS_ID = "default";

export interface FooterLink {
  label: string;
  url: string;
}

export interface PlatformSettings {
  orgName: string;
  shortName: string;
  orgFullName: string;
  tagline: string;
  foundingYear: number | null;
  contactEmail: string | null;
  facebookUrl: string | null;
  footerLinks: FooterLink[];
  defaultCurrency: string;
  defaultAbstractWordLimit: number;
}

export interface PlatformSettingsPatch {
  orgName?: string;
  shortName?: string;
  orgFullName?: string;
  tagline?: string;
  foundingYear?: number | null;
  contactEmail?: string | null;
  facebookUrl?: string | null;
  footerLinks?: FooterLink[];
  defaultCurrency?: string;
  defaultAbstractWordLimit?: number;
}

// Parse the stored footerLinks JSON into a clean {label,url} array, dropping
// anything malformed so a bad value never breaks the shell.
function parseFooterLinks(raw: string | null): FooterLink[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const links: FooterLink[] = [];
  for (const entry of parsed) {
    if (entry && typeof entry === "object") {
      const label = String((entry as Record<string, unknown>).label ?? "").trim();
      const url = String((entry as Record<string, unknown>).url ?? "").trim();
      if (label && url) links.push({ label, url });
    }
  }
  return links;
}

// Clean a submitted footerLinks list the same way, for writes.
function cleanFooterLinks(links: FooterLink[]): FooterLink[] {
  const cleaned: FooterLink[] = [];
  for (const link of links) {
    const label = (link?.label ?? "").trim();
    const url = (link?.url ?? "").trim();
    if (label && url) cleaned.push({ label, url });
  }
  return cleaned;
}

function resolveSettings(
  row: typeof schema.platformSettings.$inferSelect,
): PlatformSettings {
  return {
    orgName: row.orgName ?? "",
    shortName: row.shortName ?? "",
    orgFullName: row.orgFullName ?? "",
    tagline: row.tagline ?? "",
    foundingYear: row.foundingYear,
    contactEmail: row.contactEmail,
    facebookUrl: row.facebookUrl,
    footerLinks: parseFooterLinks(row.footerLinks),
    defaultCurrency: row.defaultCurrency,
    defaultAbstractWordLimit: row.defaultAbstractWordLimit,
  };
}

// D1 rejects a query with more than 100 bound parameters ("too many SQL
// variables"), so a batched insert of many rows must be split. A row binds one
// parameter per column, so the safe batch size is the parameter budget divided
// by the column count. The margin keeps a little headroom under the cap.
const D1_MAX_BOUND_PARAMS = 100;

function insertChunkSize(columnsPerRow: number): number {
  return Math.max(1, Math.floor((D1_MAX_BOUND_PARAMS - 10) / columnsPerRow));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function createDataAccess(db: DB) {
  // Shared guard: the abstract exists and the actor may edit it now. A chair of
  // the meeting may edit any time; the submitter may edit only before the
  // submission deadline. Returns the row.
  async function requireEditableAbstract(actor: Actor, abstractId: string) {
    const row = await db.query.abstract.findFirst({
      where: eq(schema.abstract.id, abstractId),
    });
    if (!row) throw new NotFoundError();
    if (isChair(actor, row.editionId)) return row;
    if (row.submitterId !== actor.userId) throw new ForbiddenError();
    const ed = await db.query.edition.findFirst({
      where: eq(schema.edition.id, row.editionId),
    });
    if (ed?.submissionDeadline && Date.now() > ed.submissionDeadline.getTime()) {
      throw new DeadlinePassedError("The submission deadline has passed.");
    }
    return row;
  }

  const abstracts = {
    // Read scoping: chair/admin see any abstract in the edition, the submitter
    // sees their own, an assigned reviewer sees assigned abstracts. Everyone
    // else is denied.
    async get(actor: Actor, abstractId: string) {
      const row = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, abstractId),
      });
      if (!row) throw new NotFoundError();

      if (isChair(actor, row.editionId)) return row;
      if (row.submitterId === actor.userId) return row;

      if (isReviewer(actor, row.editionId)) {
        const assigned = await db.query.reviewAssignment.findFirst({
          where: and(
            eq(schema.reviewAssignment.abstractId, abstractId),
            eq(schema.reviewAssignment.reviewerId, actor.userId),
          ),
        });
        if (assigned) return row;
      }
      throw new ForbiddenError();
    },

    // The abstract plus its authors (with the affiliation numbers attached to
    // each) and affiliations, for the edit form. Authorized like get.
    async getForEdit(actor: Actor, abstractId: string) {
      const abstract = await this.get(actor, abstractId);
      const edition = await db.query.edition.findFirst({
        where: eq(schema.edition.id, abstract.editionId),
      });
      if (!edition) throw new NotFoundError("meeting not found");
      const authors = await db
        .select()
        .from(schema.author)
        .where(eq(schema.author.abstractId, abstractId))
        .orderBy(schema.author.ordinal);
      const affiliations = await db
        .select()
        .from(schema.affiliation)
        .where(eq(schema.affiliation.abstractId, abstractId))
        .orderBy(schema.affiliation.ordinal);

      const ordinalById = new Map(affiliations.map((a) => [a.id, a.ordinal]));
      const ordinalsByAuthor = new Map<string, number[]>();
      if (authors.length > 0) {
        const links = await db
          .select()
          .from(schema.authorAffiliation)
          .where(
            inArray(
              schema.authorAffiliation.authorId,
              authors.map((a) => a.id),
            ),
          );
        for (const link of links) {
          const ord = ordinalById.get(link.affiliationId);
          if (ord === undefined) continue;
          const list = ordinalsByAuthor.get(link.authorId) ?? [];
          list.push(ord);
          ordinalsByAuthor.set(link.authorId, list);
        }
      }

      return {
        abstract,
        edition,
        authors: authors.map((a) => ({
          ...a,
          affiliationOrdinals: (ordinalsByAuthor.get(a.id) ?? []).sort(
            (x, y) => x - y,
          ),
        })),
        affiliations,
      };
    },

    // The actor's own abstracts in one meeting, drafts and submitted.
    async listMine(actor: Actor, editionId: string) {
      return db
        .select()
        .from(schema.abstract)
        .where(
          and(
            eq(schema.abstract.editionId, editionId),
            eq(schema.abstract.submitterId, actor.userId),
          ),
        )
        .orderBy(desc(schema.abstract.updatedAt));
    },

    // The actor's abstracts across every meeting, with meeting name and slug,
    // for the author dashboard.
    async listMineAll(actor: Actor) {
      return db
        .select({
          id: schema.abstract.id,
          title: schema.abstract.title,
          status: schema.abstract.status,
          updatedAt: schema.abstract.updatedAt,
          editionId: schema.abstract.editionId,
          editionName: schema.edition.name,
          editionSlug: schema.edition.slug,
        })
        .from(schema.abstract)
        .innerJoin(schema.edition, eq(schema.abstract.editionId, schema.edition.id))
        .where(eq(schema.abstract.submitterId, actor.userId))
        .orderBy(desc(schema.abstract.updatedAt));
    },

    // Start a new draft owned by the actor. The meeting's submission window must
    // be open: opens-at (if set) has passed and the deadline (if set) has not.
    async create(actor: Actor, input: { editionId: string; title: string }) {
      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.id, input.editionId),
      });
      if (!ed) throw new NotFoundError("meeting not found");
      const now = Date.now();
      if (ed.submissionOpensAt && now < ed.submissionOpensAt.getTime()) {
        throw new ValidationError("Submission is not open yet for this meeting.");
      }
      if (ed.submissionDeadline && now > ed.submissionDeadline.getTime()) {
        throw new DeadlinePassedError("The submission deadline has passed.");
      }
      const [created] = await db
        .insert(schema.abstract)
        .values({
          editionId: input.editionId,
          submitterId: actor.userId,
          title: sanitizeTitle(input.title ?? ""),
          status: "draft",
        })
        .returning();
      return created;
    },

    // Edit until deadline. Sanitizes the title (em only) and section text
    // (em, sup, sub) on every write. editionId and status are not editable here.
    async update(actor: Actor, abstractId: string, patch: Partial<AbstractInput>) {
      await requireEditableAbstract(actor, abstractId);

      const set: Partial<typeof schema.abstract.$inferInsert> = {};
      if (patch.title !== undefined) set.title = sanitizeTitle(patch.title);
      if (patch.background !== undefined) {
        set.background = sanitizeBody(patch.background);
      }
      if (patch.methods !== undefined) set.methods = sanitizeBody(patch.methods);
      if (patch.results !== undefined) set.results = sanitizeBody(patch.results);
      if (patch.conclusions !== undefined) {
        set.conclusions = sanitizeBody(patch.conclusions);
      }
      if (patch.bodyText !== undefined) {
        set.bodyText = sanitizeBody(patch.bodyText);
      }
      if (patch.presentationPreference !== undefined) {
        set.presentationPreference = patch.presentationPreference;
      }
      if (patch.categoryId !== undefined) {
        set.categoryId = patch.categoryId ? patch.categoryId : null;
      }
      if (patch.level !== undefined) {
        if (patch.level !== null && !ABSTRACT_LEVELS.includes(patch.level)) {
          throw new ValidationError("Choose a valid level.");
        }
        set.level = patch.level ?? null;
      }
      if (patch.format !== undefined) {
        if (patch.format !== null && !ABSTRACT_FORMATS.includes(patch.format)) {
          throw new ValidationError("Format must be oral or poster.");
        }
        set.format = patch.format ?? null;
      }

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.abstract)
          .set(set)
          .where(eq(schema.abstract.id, abstractId));
      }
      return this.get(actor, abstractId);
    },

    // Replace the abstract's affiliations as a set, ordinals by position. Run
    // this before setAuthors, since author links reference affiliation ordinals.
    async setAffiliations(
      actor: Actor,
      abstractId: string,
      affiliations: AffiliationInput[],
    ) {
      await requireEditableAbstract(actor, abstractId);
      await db
        .delete(schema.affiliation)
        .where(eq(schema.affiliation.abstractId, abstractId));

      const cleaned = affiliations
        .map((a) => ({
          institution: a.institution?.trim() ?? "",
          department: a.department?.trim() || null,
          city: a.city?.trim() || null,
          country: a.country?.trim() || null,
        }))
        .filter((a) => a.institution.length > 0);

      if (cleaned.length > 0) {
        const rows = cleaned.map((a, i) => ({
          abstractId,
          ordinal: i + 1,
          institution: a.institution,
          department: a.department,
          city: a.city,
          country: a.country,
        }));
        // affiliation binds 7 columns per row (id plus the six above).
        for (const part of chunk(rows, insertChunkSize(7))) {
          await db.insert(schema.affiliation).values(part);
        }
      }
      return cleaned.length;
    },

    // Replace the abstract's authors as a set, ordinals by position, and rebuild
    // their author-affiliation links by affiliation ordinal. Call setAffiliations
    // first so the ordinals resolve.
    async setAuthors(actor: Actor, abstractId: string, authors: AuthorInput[]) {
      await requireEditableAbstract(actor, abstractId);
      await db
        .delete(schema.author)
        .where(eq(schema.author.abstractId, abstractId));

      const cleaned = authors
        .map((a) => ({
          firstName: a.firstName?.trim() ?? "",
          lastName: a.lastName?.trim() ?? "",
          email: a.email?.trim() || null,
          isPresenting: !!a.isPresenting,
          isCorresponding: !!a.isCorresponding,
          affiliationOrdinals: Array.isArray(a.affiliationOrdinals)
            ? a.affiliationOrdinals
            : [],
        }))
        .filter((a) => a.firstName.length > 0 || a.lastName.length > 0);

      if (cleaned.length === 0) return 0;

      const authorRows = cleaned.map((a, i) => ({
        abstractId,
        ordinal: i + 1,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        isPresenting: a.isPresenting,
        isCorresponding: a.isCorresponding,
      }));
      // author binds 10 columns per row (id, user_id, created_at, and the seven
      // above), so split large author lists to stay under the D1 parameter cap.
      const inserted: (typeof schema.author.$inferSelect)[] = [];
      for (const part of chunk(authorRows, insertChunkSize(10))) {
        const got = await db.insert(schema.author).values(part).returning();
        inserted.push(...got);
      }

      const affs = await db
        .select({
          id: schema.affiliation.id,
          ordinal: schema.affiliation.ordinal,
        })
        .from(schema.affiliation)
        .where(eq(schema.affiliation.abstractId, abstractId));
      const affIdByOrdinal = new Map(affs.map((a) => [a.ordinal, a.id]));

      const links: { authorId: string; affiliationId: string }[] = [];
      for (const authorRow of inserted) {
        const source = cleaned[authorRow.ordinal - 1];
        if (!source) continue;
        for (const ord of source.affiliationOrdinals) {
          const affId = affIdByOrdinal.get(ord);
          if (affId) links.push({ authorId: authorRow.id, affiliationId: affId });
        }
      }
      if (links.length > 0) {
        // authorAffiliation binds 2 columns per row.
        for (const part of chunk(links, insertChunkSize(2))) {
          await db.insert(schema.authorAffiliation).values(part);
        }
      }
      return inserted.length;
    },

    // Move a draft to submitted. Only the submitter, only before the deadline,
    // and only with a title, at least one author, a non-empty body within the
    // meeting's word limit, a chosen level, and a chosen topic.
    async submit(actor: Actor, abstractId: string) {
      const row = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, abstractId),
      });
      if (!row) throw new NotFoundError();
      if (row.submitterId !== actor.userId) throw new ForbiddenError();

      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.id, row.editionId),
      });
      if (ed?.submissionDeadline && Date.now() > ed.submissionDeadline.getTime()) {
        throw new DeadlinePassedError("The submission deadline has passed.");
      }

      if (isEmptyRichText(row.title)) {
        throw new ValidationError("Add a title before submitting.");
      }
      const authorRows = await db
        .select({ id: schema.author.id })
        .from(schema.author)
        .where(eq(schema.author.abstractId, abstractId));
      if (authorRows.length < 1) {
        throw new ValidationError("Add at least one author before submitting.");
      }
      if (!row.bodyText || isEmptyRichText(row.bodyText)) {
        throw new ValidationError("Add the abstract body before submitting.");
      }
      const wordLimit = ed?.abstractWordLimit ?? DEFAULT_BODY_WORD_LIMIT;
      if (countWords(row.bodyText) > wordLimit) {
        throw new ValidationError(
          `The abstract body is over the ${wordLimit} word limit.`,
        );
      }
      if (!row.level) {
        throw new ValidationError("Choose a level before submitting.");
      }
      if (!row.categoryId) {
        throw new ValidationError("Choose a topic before submitting.");
      }

      await db
        .update(schema.abstract)
        .set({ status: "submitted", submittedAt: new Date() })
        .where(eq(schema.abstract.id, abstractId));
      return this.get(actor, abstractId);
    },

    // The submitter or a chair withdraws the abstract.
    async withdraw(actor: Actor, abstractId: string) {
      const row = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, abstractId),
      });
      if (!row) throw new NotFoundError();
      if (!isChair(actor, row.editionId) && row.submitterId !== actor.userId) {
        throw new ForbiddenError();
      }
      await db
        .update(schema.abstract)
        .set({ status: "withdrawn", withdrawnAt: new Date() })
        .where(eq(schema.abstract.id, abstractId));
      return this.get(actor, abstractId);
    },

    // Chair/admin dashboard: every abstract in the meeting that is no longer a
    // draft (submitted, under review, decided, or withdrawn), with author names
    // and the count of reviewer assignments and submitted reviews. Not for
    // reviewers; they see only their own assignments through reviews.listAssigned.
    async listForEdition(actor: Actor, editionId: string) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();

      const rows = await db
        .select()
        .from(schema.abstract)
        .where(
          and(
            eq(schema.abstract.editionId, editionId),
            ne(schema.abstract.status, "draft"),
          ),
        )
        .orderBy(desc(schema.abstract.submittedAt), desc(schema.abstract.createdAt));

      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);

      const authors = await db
        .select({
          abstractId: schema.author.abstractId,
          firstName: schema.author.firstName,
          lastName: schema.author.lastName,
        })
        .from(schema.author)
        .where(inArray(schema.author.abstractId, ids))
        .orderBy(schema.author.ordinal);

      const assignments = await db
        .select({ abstractId: schema.reviewAssignment.abstractId })
        .from(schema.reviewAssignment)
        .where(inArray(schema.reviewAssignment.abstractId, ids));

      const submittedReviews = await db
        .select({ abstractId: schema.review.abstractId })
        .from(schema.review)
        .where(
          and(
            inArray(schema.review.abstractId, ids),
            eq(schema.review.status, "submitted"),
          ),
        );

      const namesByAbstract = new Map<string, string[]>();
      for (const a of authors) {
        const name = `${a.firstName} ${a.lastName}`.trim();
        const list = namesByAbstract.get(a.abstractId) ?? [];
        if (name) list.push(name);
        namesByAbstract.set(a.abstractId, list);
      }
      const assignmentCount = new Map<string, number>();
      for (const a of assignments) {
        assignmentCount.set(a.abstractId, (assignmentCount.get(a.abstractId) ?? 0) + 1);
      }
      const reviewCount = new Map<string, number>();
      for (const r of submittedReviews) {
        reviewCount.set(r.abstractId, (reviewCount.get(r.abstractId) ?? 0) + 1);
      }

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        submittedAt: r.submittedAt,
        authorNames: namesByAbstract.get(r.id) ?? [],
        assignmentCount: assignmentCount.get(r.id) ?? 0,
        reviewCount: reviewCount.get(r.id) ?? 0,
      }));
    },
  };

  const reviews = {
    // Chair/admin only. Conflict of interest enforced at assignment time:
    // the reviewer cannot be an author of the abstract (by account or email),
    // and any declared review_conflict blocks the assignment.
    async assignReviewer(
      actor: Actor,
      input: { abstractId: string; reviewerId: string; dueAt?: Date },
    ) {
      const abs = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, input.abstractId),
      });
      if (!abs) throw new NotFoundError();
      if (!isChair(actor, abs.editionId)) throw new ForbiddenError();

      const reviewerRow = await db.query.user.findFirst({
        where: eq(schema.user.id, input.reviewerId),
      });
      if (!reviewerRow) throw new NotFoundError("reviewer not found");

      const authors = await db
        .select({ userId: schema.author.userId, email: schema.author.email })
        .from(schema.author)
        .where(eq(schema.author.abstractId, input.abstractId));

      const isOwnAuthor =
        abs.submitterId === input.reviewerId ||
        authors.some(
          (a) =>
            a.userId === input.reviewerId ||
            (!!a.email && a.email === reviewerRow.email),
        );
      if (isOwnAuthor) throw new ConflictOfInterestError("reviewer is an author");

      const declared = await db.query.reviewConflict.findFirst({
        where: and(
          eq(schema.reviewConflict.abstractId, input.abstractId),
          eq(schema.reviewConflict.reviewerId, input.reviewerId),
        ),
      });
      if (declared) throw new ConflictOfInterestError(declared.reason);

      const [created] = await db
        .insert(schema.reviewAssignment)
        .values({
          editionId: abs.editionId,
          abstractId: input.abstractId,
          reviewerId: input.reviewerId,
          assignedById: actor.userId,
          dueAt: input.dueAt,
        })
        .returning();
      return created;
    },

    // The reviewer who owns the assignment submits the review. Scores are
    // validated against each criterion's min/max before write. This phase runs
    // no rubric, so input.scores is normally empty; the validation still holds
    // for any score that is sent. Editing is allowed until the review deadline.
    async submit(actor: Actor, input: ReviewSubmission) {
      const assignment = await db.query.reviewAssignment.findFirst({
        where: eq(schema.reviewAssignment.id, input.assignmentId),
      });
      if (!assignment) throw new NotFoundError();
      if (assignment.reviewerId !== actor.userId) throw new ForbiddenError();

      if (!REVIEW_RECOMMENDATIONS.includes(input.recommendation)) {
        throw new ValidationError("Choose a recommendation.");
      }

      const edition = await db.query.edition.findFirst({
        where: eq(schema.edition.id, assignment.editionId),
      });
      if (
        edition?.reviewDeadline &&
        Date.now() > edition.reviewDeadline.getTime()
      ) {
        throw new DeadlinePassedError("The review deadline has passed.");
      }

      const criteria = await db
        .select()
        .from(schema.rubricCriterion)
        .where(
          inArray(
            schema.rubricCriterion.id,
            input.scores.map((s) => s.criterionId),
          ),
        );
      const byId = new Map(criteria.map((c) => [c.id, c]));
      for (const s of input.scores) {
        const c = byId.get(s.criterionId);
        if (!c || c.editionId !== assignment.editionId) {
          throw new ForbiddenError("score for unknown criterion");
        }
        if (s.score < c.scaleMin || s.score > c.scaleMax) {
          throw new ForbiddenError("score out of range");
        }
      }

      // Comments follow the abstract body allowlist (em, sup, sub); everything
      // else is stripped to plain text. An empty comment stores null.
      const overall = input.overallComment
        ? sanitizeBody(input.overallComment)
        : null;
      const confidential = input.confidentialComment
        ? sanitizeBody(input.confidentialComment)
        : null;

      // One review per assignment: update the existing row or insert a new one.
      const existing = await db.query.review.findFirst({
        where: eq(schema.review.assignmentId, assignment.id),
      });
      let reviewId: string;
      if (existing) {
        await db
          .update(schema.review)
          .set({
            recommendation: input.recommendation,
            overallComment: overall && !isEmptyRichText(overall) ? overall : null,
            confidentialComment:
              confidential && !isEmptyRichText(confidential) ? confidential : null,
            status: "submitted",
            submittedAt: new Date(),
          })
          .where(eq(schema.review.id, existing.id));
        reviewId = existing.id;
      } else {
        const [created] = await db
          .insert(schema.review)
          .values({
            assignmentId: assignment.id,
            editionId: assignment.editionId,
            abstractId: assignment.abstractId,
            reviewerId: actor.userId,
            recommendation: input.recommendation,
            overallComment: overall && !isEmptyRichText(overall) ? overall : null,
            confidentialComment:
              confidential && !isEmptyRichText(confidential) ? confidential : null,
            status: "submitted",
            submittedAt: new Date(),
          })
          .returning();
        reviewId = created.id;
      }

      // Replace scores as a set. With no rubric this phase, that is zero scores.
      await db
        .delete(schema.reviewScore)
        .where(eq(schema.reviewScore.reviewId, reviewId));
      if (input.scores.length > 0) {
        await db.insert(schema.reviewScore).values(
          input.scores.map((s) => ({
            reviewId,
            criterionId: s.criterionId,
            score: s.score,
          })),
        );
      }

      await db
        .update(schema.reviewAssignment)
        .set({ status: "completed" })
        .where(eq(schema.reviewAssignment.id, assignment.id));

      return { id: reviewId };
    },

    // The one assignment the acting reviewer owns, with the abstract to read and
    // any review already started, for the review form. Scoped to the owner: a
    // reviewer who does not own the assignment is forbidden. The reviewer sees
    // their own confidential comment because they wrote it.
    async getAssignmentForReview(actor: Actor, assignmentId: string) {
      const assignment = await db.query.reviewAssignment.findFirst({
        where: eq(schema.reviewAssignment.id, assignmentId),
      });
      if (!assignment) throw new NotFoundError();
      if (assignment.reviewerId !== actor.userId) throw new ForbiddenError();

      const abs = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, assignment.abstractId),
      });
      if (!abs) throw new NotFoundError();

      const edition = await db.query.edition.findFirst({
        where: eq(schema.edition.id, assignment.editionId),
      });

      const authorRows = await db
        .select({
          firstName: schema.author.firstName,
          lastName: schema.author.lastName,
        })
        .from(schema.author)
        .where(eq(schema.author.abstractId, abs.id))
        .orderBy(schema.author.ordinal);

      const existing = await db.query.review.findFirst({
        where: eq(schema.review.assignmentId, assignmentId),
      });

      const deadline = edition?.reviewDeadline ?? null;
      const deadlinePassed = !!deadline && Date.now() > deadline.getTime();

      return {
        assignment: {
          id: assignment.id,
          status: assignment.status,
          dueAt: assignment.dueAt,
        },
        edition: {
          id: assignment.editionId,
          name: edition?.name ?? "",
          reviewDeadline: deadline,
          deadlinePassed,
        },
        abstract: {
          id: abs.id,
          title: abs.title,
          background: abs.background ?? "",
          methods: abs.methods ?? "",
          results: abs.results ?? "",
          conclusions: abs.conclusions ?? "",
          bodyText: abs.bodyText ?? "",
          presentationPreference: abs.presentationPreference,
        },
        authors: authorRows.map((a) => ({
          firstName: a.firstName,
          lastName: a.lastName,
        })),
        review: existing
          ? {
              recommendation: existing.recommendation,
              overallComment: existing.overallComment ?? "",
              confidentialComment: existing.confidentialComment ?? "",
              status: existing.status,
            }
          : null,
      };
    },

    // Reviewer view: abstracts assigned to the acting reviewer in one edition,
    // with the assignment status, due date, and whether a review is in yet.
    async listAssigned(actor: Actor, editionId: string) {
      return db
        .select({
          assignmentId: schema.reviewAssignment.id,
          status: schema.reviewAssignment.status,
          dueAt: schema.reviewAssignment.dueAt,
          abstractId: schema.abstract.id,
          title: schema.abstract.title,
          reviewStatus: schema.review.status,
        })
        .from(schema.reviewAssignment)
        .innerJoin(
          schema.abstract,
          eq(schema.reviewAssignment.abstractId, schema.abstract.id),
        )
        .leftJoin(
          schema.review,
          eq(schema.review.assignmentId, schema.reviewAssignment.id),
        )
        .where(
          and(
            eq(schema.reviewAssignment.reviewerId, actor.userId),
            eq(schema.reviewAssignment.editionId, editionId),
          ),
        )
        .orderBy(asc(schema.reviewAssignment.dueAt));
    },

    // Reviewer dashboard across every meeting: the acting reviewer's assignments
    // with meeting name, status, due date, and whether a review is submitted.
    async listAssignedAll(actor: Actor) {
      const rows = await db
        .select({
          assignmentId: schema.reviewAssignment.id,
          status: schema.reviewAssignment.status,
          dueAt: schema.reviewAssignment.dueAt,
          abstractId: schema.abstract.id,
          title: schema.abstract.title,
          editionId: schema.edition.id,
          editionName: schema.edition.name,
          reviewStatus: schema.review.status,
        })
        .from(schema.reviewAssignment)
        .innerJoin(
          schema.abstract,
          eq(schema.reviewAssignment.abstractId, schema.abstract.id),
        )
        .innerJoin(
          schema.edition,
          eq(schema.reviewAssignment.editionId, schema.edition.id),
        )
        .leftJoin(
          schema.review,
          eq(schema.review.assignmentId, schema.reviewAssignment.id),
        )
        .where(eq(schema.reviewAssignment.reviewerId, actor.userId))
        .orderBy(desc(schema.reviewAssignment.assignedAt));
      return rows.map((r) => ({
        assignmentId: r.assignmentId,
        status: r.status,
        dueAt: r.dueAt,
        abstractId: r.abstractId,
        title: r.title,
        editionId: r.editionId,
        editionName: r.editionName,
        reviewSubmitted: r.reviewStatus === "submitted",
      }));
    },

    // Chair/admin view: every assignment in the meeting with the reviewer's name
    // and whether their review is submitted. Powers the assignment screen's list
    // of who is on each abstract. Confidential comments are never included here.
    async listAssignmentsForEdition(actor: Actor, editionId: string) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const rows = await db
        .select({
          assignmentId: schema.reviewAssignment.id,
          abstractId: schema.reviewAssignment.abstractId,
          reviewerId: schema.reviewAssignment.reviewerId,
          reviewerName: schema.user.name,
          reviewerEmail: schema.user.email,
          status: schema.reviewAssignment.status,
          reviewStatus: schema.review.status,
        })
        .from(schema.reviewAssignment)
        .innerJoin(
          schema.user,
          eq(schema.reviewAssignment.reviewerId, schema.user.id),
        )
        .leftJoin(
          schema.review,
          eq(schema.review.assignmentId, schema.reviewAssignment.id),
        )
        .where(eq(schema.reviewAssignment.editionId, editionId))
        .orderBy(asc(schema.user.email));
      return rows.map((r) => ({
        assignmentId: r.assignmentId,
        abstractId: r.abstractId,
        reviewerId: r.reviewerId,
        reviewerName: r.reviewerName,
        reviewerEmail: r.reviewerEmail,
        status: r.status,
        reviewSubmitted: r.reviewStatus === "submitted",
      }));
    },

    // Chair/admin only: all submitted reviews for one abstract, both comments
    // included, for the chair to read before deciding. Reviewers never reach
    // this; the confidential comment is chair/admin only.
    async listForAbstract(actor: Actor, abstractId: string) {
      const abs = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, abstractId),
      });
      if (!abs) throw new NotFoundError();
      if (!isChair(actor, abs.editionId)) throw new ForbiddenError();

      return db
        .select({
          id: schema.review.id,
          reviewerName: schema.user.name,
          reviewerEmail: schema.user.email,
          recommendation: schema.review.recommendation,
          overallComment: schema.review.overallComment,
          confidentialComment: schema.review.confidentialComment,
          submittedAt: schema.review.submittedAt,
        })
        .from(schema.review)
        .innerJoin(schema.user, eq(schema.review.reviewerId, schema.user.id))
        .where(
          and(
            eq(schema.review.abstractId, abstractId),
            eq(schema.review.status, "submitted"),
          ),
        )
        .orderBy(asc(schema.user.email));
    },

    // Chair/admin removes an assignment. The review row, if any, cascades away
    // with it.
    async unassign(actor: Actor, input: { assignmentId: string }) {
      const assignment = await db.query.reviewAssignment.findFirst({
        where: eq(schema.reviewAssignment.id, input.assignmentId),
      });
      if (!assignment) throw new NotFoundError();
      if (!isChair(actor, assignment.editionId)) throw new ForbiddenError();
      await db
        .delete(schema.reviewAssignment)
        .where(eq(schema.reviewAssignment.id, input.assignmentId));
      return { id: input.assignmentId };
    },

    // The acting reviewer records a conflict on an abstract. Recording it removes
    // any existing assignment and, through assignReviewer's declared-conflict
    // check, blocks a future one. The actor must be a reviewer in that meeting.
    async declareConflict(
      actor: Actor,
      input: { abstractId: string; reason: string; note?: string },
    ) {
      const abs = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, input.abstractId),
      });
      if (!abs) throw new NotFoundError();
      if (!isReviewer(actor, abs.editionId)) {
        throw new ForbiddenError("Only a reviewer in this meeting can declare a conflict.");
      }
      if (!CONFLICT_REASONS.includes(input.reason as ConflictReason)) {
        throw new ValidationError("Choose a reason for the conflict.");
      }

      await db
        .insert(schema.reviewConflict)
        .values({
          editionId: abs.editionId,
          abstractId: input.abstractId,
          reviewerId: actor.userId,
          reason: input.reason as ConflictReason,
          note: input.note?.trim() || null,
          declaredById: actor.userId,
        })
        .onConflictDoNothing();

      await db
        .delete(schema.reviewAssignment)
        .where(
          and(
            eq(schema.reviewAssignment.abstractId, input.abstractId),
            eq(schema.reviewAssignment.reviewerId, actor.userId),
          ),
        );

      return { ok: true };
    },
  };

  // Roles: admins grant and revoke chair and reviewer per meeting. admin itself
  // is not grantable here; it stays seeded from ADMIN_EMAIL. Accounts are created
  // on first sign-in, so a grant needs the person to have signed in once.
  const roles = {
    async listForEdition(actor: Actor, editionId: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      return db
        .select({
          userId: schema.roleGrant.userId,
          role: schema.roleGrant.role,
          name: schema.user.name,
          email: schema.user.email,
          createdAt: schema.roleGrant.createdAt,
        })
        .from(schema.roleGrant)
        .innerJoin(schema.user, eq(schema.roleGrant.userId, schema.user.id))
        .where(
          and(
            eq(schema.roleGrant.editionId, editionId),
            eq(schema.roleGrant.status, "active"),
            inArray(schema.roleGrant.role, ["chair", "reviewer"]),
          ),
        )
        .orderBy(asc(schema.roleGrant.role), asc(schema.user.email));
    },

    async grant(actor: Actor, input: RoleGrantInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      if (input.role !== "chair" && input.role !== "reviewer") {
        throw new ValidationError("Role must be chair or reviewer.");
      }
      const email = input.email.trim().toLowerCase();
      if (!email) throw new ValidationError("Enter an email address.");

      const person = await db.query.user.findFirst({
        where: eq(schema.user.email, email),
      });
      if (!person) {
        throw new NotFoundError(
          "No account with that email yet. Ask the person to sign in once first, then grant the role.",
        );
      }

      await db
        .insert(schema.roleGrant)
        .values({
          userId: person.id,
          role: input.role,
          editionId: input.editionId,
          grantedById: actor.userId,
        })
        .onConflictDoNothing();

      return { userId: person.id, role: input.role };
    },

    // Delete the grant rather than mark it revoked, so a later grant of the same
    // role reinstates cleanly through onConflictDoNothing. admin grants are never
    // touched here: role is constrained to chair or reviewer and the delete is
    // scoped to a single edition.
    async revoke(actor: Actor, input: RoleRevokeInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      if (input.role !== "chair" && input.role !== "reviewer") {
        throw new ValidationError("Role must be chair or reviewer.");
      }
      await db
        .delete(schema.roleGrant)
        .where(
          and(
            eq(schema.roleGrant.userId, input.userId),
            eq(schema.roleGrant.role, input.role),
            eq(schema.roleGrant.editionId, input.editionId),
          ),
        );
      return { userId: input.userId, role: input.role };
    },
  };

  // Decisions: the chair reads the reviews and records accept/reject/revise per
  // abstract. One decision per abstract. Email is deferred, so the decision is
  // shown to the author in-app; notifyState stays none until mail is built.
  const decisions = {
    // Chair/admin of the meeting records or updates the decision for one
    // abstract. presentationType is required on accept and dropped otherwise.
    // The message is sanitized with the body allowlist. Side effect on the
    // abstract status: accept -> accepted, reject -> rejected, revise leaves it.
    async setDecision(actor: Actor, input: DecisionInput) {
      const abs = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, input.abstractId),
      });
      if (!abs) throw new NotFoundError();
      if (!isChair(actor, abs.editionId)) throw new ForbiddenError();

      if (!DECISION_OUTCOMES.includes(input.outcome)) {
        throw new ValidationError("Choose accept, reject, or revise.");
      }

      let presentationType: PresentationType | null = null;
      if (input.outcome === "accept") {
        if (
          input.presentationType !== "oral" &&
          input.presentationType !== "poster"
        ) {
          throw new ValidationError(
            "Choose oral or poster for an accepted abstract.",
          );
        }
        presentationType = input.presentationType;
      }

      const sanitized = input.decisionMessage
        ? sanitizeBody(input.decisionMessage)
        : null;
      const message =
        sanitized && !isEmptyRichText(sanitized) ? sanitized : null;

      const existing = await db.query.decision.findFirst({
        where: eq(schema.decision.abstractId, input.abstractId),
      });
      if (existing) {
        await db
          .update(schema.decision)
          .set({
            outcome: input.outcome,
            presentationType,
            decisionMessage: message,
            decidedById: actor.userId,
            decidedAt: new Date(),
          })
          .where(eq(schema.decision.id, existing.id));
      } else {
        await db.insert(schema.decision).values({
          editionId: abs.editionId,
          abstractId: input.abstractId,
          outcome: input.outcome,
          presentationType,
          decisionMessage: message,
          decidedById: actor.userId,
        });
      }

      // Move the abstract to match an accept or reject. A revise decision leaves
      // the abstract as it is (submitted or under_review) so the author can act.
      if (input.outcome === "accept") {
        await db
          .update(schema.abstract)
          .set({ status: "accepted" })
          .where(eq(schema.abstract.id, input.abstractId));
      } else if (input.outcome === "reject") {
        await db
          .update(schema.abstract)
          .set({ status: "rejected" })
          .where(eq(schema.abstract.id, input.abstractId));
      }

      return this.getForAbstract(actor, input.abstractId);
    },

    // Chair/admin dashboard: every non-draft abstract in the meeting with its
    // decision (if any), the author names, the count of submitted reviews, and a
    // compact tally of review recommendations so the chair can decide at a glance.
    async listForEdition(actor: Actor, editionId: string) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();

      const rows = await db
        .select()
        .from(schema.abstract)
        .where(
          and(
            eq(schema.abstract.editionId, editionId),
            ne(schema.abstract.status, "draft"),
          ),
        )
        .orderBy(desc(schema.abstract.submittedAt), desc(schema.abstract.createdAt));

      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);

      const authors = await db
        .select({
          abstractId: schema.author.abstractId,
          firstName: schema.author.firstName,
          lastName: schema.author.lastName,
        })
        .from(schema.author)
        .where(inArray(schema.author.abstractId, ids))
        .orderBy(schema.author.ordinal);

      const submittedReviews = await db
        .select({
          abstractId: schema.review.abstractId,
          recommendation: schema.review.recommendation,
        })
        .from(schema.review)
        .where(
          and(
            inArray(schema.review.abstractId, ids),
            eq(schema.review.status, "submitted"),
          ),
        );

      const decisionRows = await db
        .select()
        .from(schema.decision)
        .where(inArray(schema.decision.abstractId, ids));

      const namesByAbstract = new Map<string, string[]>();
      for (const a of authors) {
        const name = `${a.firstName} ${a.lastName}`.trim();
        const list = namesByAbstract.get(a.abstractId) ?? [];
        if (name) list.push(name);
        namesByAbstract.set(a.abstractId, list);
      }

      const summaryByAbstract = new Map<
        string,
        { accept: number; reject: number; revise: number; total: number }
      >();
      for (const r of submittedReviews) {
        const s =
          summaryByAbstract.get(r.abstractId) ??
          { accept: 0, reject: 0, revise: 0, total: 0 };
        s.total += 1;
        if (r.recommendation === "accept") s.accept += 1;
        else if (r.recommendation === "reject") s.reject += 1;
        else if (r.recommendation === "revise") s.revise += 1;
        summaryByAbstract.set(r.abstractId, s);
      }

      const decisionByAbstract = new Map(
        decisionRows.map((d) => [d.abstractId, d]),
      );

      return rows.map((r) => {
        const decisionRow = decisionByAbstract.get(r.id);
        const summary =
          summaryByAbstract.get(r.id) ??
          { accept: 0, reject: 0, revise: 0, total: 0 };
        return {
          id: r.id,
          title: r.title,
          status: r.status,
          submittedAt: r.submittedAt,
          authorNames: namesByAbstract.get(r.id) ?? [],
          reviewCount: summary.total,
          recommendationSummary: {
            accept: summary.accept,
            reject: summary.reject,
            revise: summary.revise,
          },
          decision: decisionRow
            ? {
                outcome: decisionRow.outcome,
                presentationType: decisionRow.presentationType,
                decisionMessage: decisionRow.decisionMessage,
                decidedAt: decisionRow.decidedAt,
                notifyState: decisionRow.notifyState,
              }
            : null,
        };
      });
    },

    // One abstract's decision, for the chair or the abstract's own submitter. The
    // author sees their own decision this way; the visibility rule lives here, not
    // only in the UI. Returns null when no decision has been recorded.
    async getForAbstract(actor: Actor, abstractId: string) {
      const abs = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, abstractId),
      });
      if (!abs) throw new NotFoundError();
      if (!isChair(actor, abs.editionId) && abs.submitterId !== actor.userId) {
        throw new ForbiddenError();
      }
      const row = await db.query.decision.findFirst({
        where: eq(schema.decision.abstractId, abstractId),
      });
      if (!row) return null;
      return {
        outcome: row.outcome,
        presentationType: row.presentationType,
        decisionMessage: row.decisionMessage,
        decidedAt: row.decidedAt,
        notifyState: row.notifyState,
        notifiedAt: row.notifiedAt,
      };
    },

    // Chair/admin removes a decision, for corrections, and reverts the abstract
    // status to under_review when reviewers are still assigned, otherwise to
    // submitted.
    async clearDecision(actor: Actor, abstractId: string) {
      const abs = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, abstractId),
      });
      if (!abs) throw new NotFoundError();
      if (!isChair(actor, abs.editionId)) throw new ForbiddenError();

      await db
        .delete(schema.decision)
        .where(eq(schema.decision.abstractId, abstractId));

      const assignments = await db
        .select({ id: schema.reviewAssignment.id })
        .from(schema.reviewAssignment)
        .where(eq(schema.reviewAssignment.abstractId, abstractId));
      const revert = assignments.length > 0 ? "under_review" : "submitted";
      await db
        .update(schema.abstract)
        .set({ status: revert })
        .where(eq(schema.abstract.id, abstractId));

      return { abstractId };
    },

    // Notify the abstract's author of the decision. The email is sent by the
    // caller through the injected send function, so the email helper stays out of
    // the data layer; here we load what the message needs and record the result.
    // On a real send the state becomes emailed with notifiedAt; when email is
    // dormant it becomes in_app (the author already sees the decision in the app)
    // and notifiedAt is left unset. Chair/admin only.
    async notifyAuthor(
      actor: Actor,
      abstractId: string,
      send: (payload: {
        to: string;
        meetingName: string;
        title: string;
        outcome: DecisionOutcome;
        presentationType: PresentationType | null;
        message: string | null;
      }) => Promise<{ sent: boolean }>,
    ): Promise<{ notifyState: "emailed" | "in_app"; sent: boolean }> {
      const abs = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, abstractId),
      });
      if (!abs) throw new NotFoundError();
      if (!isChair(actor, abs.editionId)) throw new ForbiddenError();

      const decisionRow = await db.query.decision.findFirst({
        where: eq(schema.decision.abstractId, abstractId),
      });
      if (!decisionRow) {
        throw new ValidationError(
          "Record a decision before notifying the author.",
        );
      }

      const submitter = await db.query.user.findFirst({
        where: eq(schema.user.id, abs.submitterId),
      });
      if (!submitter?.email) {
        throw new ValidationError("The author has no email address on file.");
      }
      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.id, abs.editionId),
      });

      const result = await send({
        to: submitter.email,
        meetingName: ed?.name ?? "",
        title: abs.title,
        outcome: decisionRow.outcome,
        presentationType: decisionRow.presentationType,
        message: decisionRow.decisionMessage,
      });

      if (result.sent) {
        await db
          .update(schema.decision)
          .set({ notifyState: "emailed", notifiedAt: new Date() })
          .where(eq(schema.decision.id, decisionRow.id));
        return { notifyState: "emailed", sent: true };
      }
      await db
        .update(schema.decision)
        .set({ notifyState: "in_app" })
        .where(eq(schema.decision.id, decisionRow.id));
      return { notifyState: "in_app", sent: false };
    },
  };

  // Abstract book: assemble everything the printed proceedings need for one
  // meeting. Chair/admin only. The return is a plain data structure so the pure
  // renderBook in ./book is a function of it. Part B will read the same data.
  const books = {
    async getBookData(actor: Actor, editionId: string): Promise<BookData> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();

      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.id, editionId),
      });
      if (!ed) throw new NotFoundError("meeting not found");

      const front = {
        name: ed.name,
        season: ed.season,
        year: ed.year,
        meetingStartsAt: ed.meetingStartsAt,
        meetingEndsAt: ed.meetingEndsAt,
        venueName: ed.venueName,
        city: ed.city,
      };

      const absRows = await db
        .select()
        .from(schema.abstract)
        .where(
          and(
            eq(schema.abstract.editionId, editionId),
            eq(schema.abstract.status, "accepted"),
          ),
        );

      if (absRows.length === 0) {
        return {
          edition: front,
          categories: [],
          authorIndex: [],
          abstractCount: 0,
        };
      }

      const ids = absRows.map((a) => a.id);

      const authorRows = await db
        .select()
        .from(schema.author)
        .where(inArray(schema.author.abstractId, ids))
        .orderBy(schema.author.ordinal);

      const affiliationRows = await db
        .select()
        .from(schema.affiliation)
        .where(inArray(schema.affiliation.abstractId, ids))
        .orderBy(schema.affiliation.ordinal);

      const links = authorRows.length
        ? await db
            .select()
            .from(schema.authorAffiliation)
            .where(
              inArray(
                schema.authorAffiliation.authorId,
                authorRows.map((a) => a.id),
              ),
            )
        : [];

      const categoryRows = await db
        .select()
        .from(schema.abstractCategory)
        .where(eq(schema.abstractCategory.editionId, editionId))
        .orderBy(schema.abstractCategory.sortOrder, schema.abstractCategory.name);

      // affiliation ordinal by its id (ids are globally unique, so this is safe
      // across abstracts), then the ordinals attached to each author.
      const affOrdinalById = new Map(
        affiliationRows.map((a) => [a.id, a.ordinal]),
      );
      const ordinalsByAuthor = new Map<string, number[]>();
      for (const link of links) {
        const ord = affOrdinalById.get(link.affiliationId);
        if (ord === undefined) continue;
        const list = ordinalsByAuthor.get(link.authorId) ?? [];
        list.push(ord);
        ordinalsByAuthor.set(link.authorId, list);
      }

      const affiliationsByAbstract = new Map<string, BookAffiliation[]>();
      for (const a of affiliationRows) {
        const list = affiliationsByAbstract.get(a.abstractId) ?? [];
        list.push({
          ordinal: a.ordinal,
          institution: a.institution,
          department: a.department,
          city: a.city,
          country: a.country,
        });
        affiliationsByAbstract.set(a.abstractId, list);
      }

      const authorsByAbstract = new Map<string, BookAuthor[]>();
      for (const a of authorRows) {
        const list = authorsByAbstract.get(a.abstractId) ?? [];
        list.push({
          firstName: a.firstName,
          lastName: a.lastName,
          isPresenting: a.isPresenting,
          isCorresponding: a.isCorresponding,
          affiliationOrdinals: (ordinalsByAuthor.get(a.id) ?? []).sort(
            (x, y) => x - y,
          ),
        });
        authorsByAbstract.set(a.abstractId, list);
      }

      // decisions carry the presentation type; attach it for the book.
      const decisionRows = await db
        .select({
          abstractId: schema.decision.abstractId,
          presentationType: schema.decision.presentationType,
        })
        .from(schema.decision)
        .where(inArray(schema.decision.abstractId, ids));
      const presentationByAbstract = new Map(
        decisionRows.map((d) => [d.abstractId, d.presentationType]),
      );

      function presentingName(authors: BookAuthor[]): string | null {
        if (authors.length === 0) return null;
        const presenting = authors.find((a) => a.isPresenting) ?? authors[0];
        return `${presenting.firstName} ${presenting.lastName}`.trim() || null;
      }

      // Build each abstract (unnumbered), keyed by id for grouping.
      const builtById = new Map<string, Omit<BookAbstract, "number">>();
      for (const row of absRows) {
        const authors = authorsByAbstract.get(row.id) ?? [];
        builtById.set(row.id, {
          title: row.title,
          background: row.background,
          methods: row.methods,
          results: row.results,
          conclusions: row.conclusions,
          bodyText: row.bodyText,
          presentationType: presentationByAbstract.get(row.id) ?? null,
          authors,
          affiliations: affiliationsByAbstract.get(row.id) ?? [],
          presentingAuthorName: presentingName(authors),
        });
      }

      // Group by category id, ordering abstracts within a group by title.
      const rowsByCategory = new Map<string | null, typeof absRows>();
      for (const row of absRows) {
        const key = row.categoryId ?? null;
        const list = rowsByCategory.get(key) ?? [];
        list.push(row);
        rowsByCategory.set(key, list);
      }
      function sortByTitle(a: (typeof absRows)[number], b: (typeof absRows)[number]) {
        return extractPlainText(a.title).localeCompare(
          extractPlainText(b.title),
          "en",
          { sensitivity: "base" },
        );
      }

      // Categories in sortOrder then name, uncategorized last, empties dropped.
      const orderedGroups: Array<{ id: string | null; name: string; rows: typeof absRows }> =
        [];
      for (const cat of categoryRows) {
        const rows = rowsByCategory.get(cat.id);
        if (rows && rows.length > 0) {
          orderedGroups.push({ id: cat.id, name: cat.name, rows: [...rows].sort(sortByTitle) });
        }
      }
      const uncategorized = rowsByCategory.get(null);
      if (uncategorized && uncategorized.length > 0) {
        orderedGroups.push({
          id: null,
          name: "Uncategorized",
          rows: [...uncategorized].sort(sortByTitle),
        });
      }

      // Assign the stable 1..n number in grouped order and assemble categories.
      let counter = 0;
      const categories: BookCategory[] = orderedGroups.map((group) => ({
        id: group.id,
        name: group.name,
        abstracts: group.rows.map((row) => {
          counter += 1;
          const built = builtById.get(row.id)!;
          return { ...built, number: counter };
        }),
      }));

      // Author index: merge a person across abstracts by name, numbers ascending.
      const indexByKey = new Map<
        string,
        { name: string; lastName: string; firstName: string; numbers: Set<number> }
      >();
      for (const category of categories) {
        for (const abstract of category.abstracts) {
          for (const author of abstract.authors) {
            const first = author.firstName.trim();
            const last = author.lastName.trim();
            if (!first && !last) continue;
            const key = `${last.toLowerCase()} ${first.toLowerCase()}`;
            const entry =
              indexByKey.get(key) ??
              {
                name: `${first} ${last}`.trim(),
                lastName: last,
                firstName: first,
                numbers: new Set<number>(),
              };
            entry.numbers.add(abstract.number);
            indexByKey.set(key, entry);
          }
        }
      }
      const authorIndex: BookIndexEntry[] = [...indexByKey.values()]
        .sort(
          (a, b) =>
            a.lastName.localeCompare(b.lastName, "en", { sensitivity: "base" }) ||
            a.firstName.localeCompare(b.firstName, "en", { sensitivity: "base" }),
        )
        .map((entry) => ({
          name: entry.name,
          numbers: [...entry.numbers].sort((x, y) => x - y),
        }));

      return {
        edition: front,
        categories,
        authorIndex,
        abstractCount: counter,
      };
    },
  };

  // Accepted abstracts for an edition, numbered the same way the abstract book
  // numbers them (category sortOrder then name, uncategorized last, title-sorted,
  // then 1..n), so the program and the book reference the same numbers.
  async function numberedAcceptedAbstracts(
    editionId: string,
  ): Promise<ProgramAbstractOption[]> {
    const absRows = await db
      .select({
        id: schema.abstract.id,
        title: schema.abstract.title,
        categoryId: schema.abstract.categoryId,
      })
      .from(schema.abstract)
      .where(
        and(
          eq(schema.abstract.editionId, editionId),
          eq(schema.abstract.status, "accepted"),
        ),
      );
    if (absRows.length === 0) return [];

    const ids = absRows.map((a) => a.id);
    const authorRows = await db
      .select({
        abstractId: schema.author.abstractId,
        firstName: schema.author.firstName,
        lastName: schema.author.lastName,
        isPresenting: schema.author.isPresenting,
      })
      .from(schema.author)
      .where(inArray(schema.author.abstractId, ids))
      .orderBy(schema.author.ordinal);

    const categoryRows = await db
      .select()
      .from(schema.abstractCategory)
      .where(eq(schema.abstractCategory.editionId, editionId))
      .orderBy(schema.abstractCategory.sortOrder, schema.abstractCategory.name);

    const authorsByAbstract = new Map<
      string,
      Array<{ firstName: string; lastName: string; isPresenting: boolean }>
    >();
    for (const a of authorRows) {
      const list = authorsByAbstract.get(a.abstractId) ?? [];
      list.push({
        firstName: a.firstName,
        lastName: a.lastName,
        isPresenting: a.isPresenting,
      });
      authorsByAbstract.set(a.abstractId, list);
    }
    function presentingName(abstractId: string): string | null {
      const authors = authorsByAbstract.get(abstractId) ?? [];
      if (authors.length === 0) return null;
      const presenting = authors.find((x) => x.isPresenting) ?? authors[0];
      return `${presenting.firstName} ${presenting.lastName}`.trim() || null;
    }

    const rowsByCategory = new Map<string | null, typeof absRows>();
    for (const row of absRows) {
      const key = row.categoryId ?? null;
      const list = rowsByCategory.get(key) ?? [];
      list.push(row);
      rowsByCategory.set(key, list);
    }
    const byTitle = (
      a: (typeof absRows)[number],
      b: (typeof absRows)[number],
    ) =>
      extractPlainText(a.title).localeCompare(extractPlainText(b.title), "en", {
        sensitivity: "base",
      });

    const ordered: typeof absRows = [];
    for (const cat of categoryRows) {
      const rows = rowsByCategory.get(cat.id);
      if (rows && rows.length > 0) ordered.push(...[...rows].sort(byTitle));
    }
    const uncategorized = rowsByCategory.get(null);
    if (uncategorized && uncategorized.length > 0) {
      ordered.push(...[...uncategorized].sort(byTitle));
    }

    return ordered.map((row, i) => ({
      abstractId: row.id,
      number: i + 1,
      title: row.title,
      presentingAuthorName: presentingName(row.id),
    }));
  }

  // Turn raw session and item rows into the resolved shape the builder and the
  // public view render. Abstract items get their number from the book numbering
  // and their title and presenting author from a direct fetch, so an item whose
  // abstract is no longer accepted still shows a title (with a null number).
  async function resolveProgram(
    editionId: string,
    sessions: Array<typeof schema.programSession.$inferSelect>,
    items: Array<typeof schema.programItem.$inferSelect>,
  ): Promise<ProgramSessionResolved[]> {
    const numbered = await numberedAcceptedAbstracts(editionId);
    const numberById = new Map(numbered.map((n) => [n.abstractId, n.number]));

    // Invited-speaker items: resolve name and talk title from a direct fetch, so
    // an item whose speaker was later removed (speaker_id set null) still renders
    // by its kind label.
    const speakerRefIds = [
      ...new Set(
        items.map((i) => i.speakerId).filter((x): x is string => x !== null),
      ),
    ];
    const speakerNameById = new Map<string, string>();
    const speakerTalkById = new Map<string, string | null>();
    if (speakerRefIds.length > 0) {
      const speakerRows = await db
        .select({
          id: schema.invitedSpeaker.id,
          name: schema.invitedSpeaker.name,
          talkTitle: schema.invitedSpeaker.talkTitle,
        })
        .from(schema.invitedSpeaker)
        .where(inArray(schema.invitedSpeaker.id, speakerRefIds));
      for (const s of speakerRows) {
        speakerNameById.set(s.id, s.name);
        speakerTalkById.set(s.id, s.talkTitle);
      }
    }

    const refIds = [
      ...new Set(
        items
          .map((i) => i.abstractId)
          .filter((x): x is string => x !== null),
      ),
    ];
    const titleById = new Map<string, string>();
    const presentingById = new Map<string, string | null>();
    if (refIds.length > 0) {
      const absRows = await db
        .select({ id: schema.abstract.id, title: schema.abstract.title })
        .from(schema.abstract)
        .where(inArray(schema.abstract.id, refIds));
      for (const a of absRows) titleById.set(a.id, a.title);

      const authorRows = await db
        .select({
          abstractId: schema.author.abstractId,
          firstName: schema.author.firstName,
          lastName: schema.author.lastName,
          isPresenting: schema.author.isPresenting,
        })
        .from(schema.author)
        .where(inArray(schema.author.abstractId, refIds))
        .orderBy(schema.author.ordinal);
      const authorsByAbstract = new Map<
        string,
        Array<{ firstName: string; lastName: string; isPresenting: boolean }>
      >();
      for (const a of authorRows) {
        const list = authorsByAbstract.get(a.abstractId) ?? [];
        list.push({
          firstName: a.firstName,
          lastName: a.lastName,
          isPresenting: a.isPresenting,
        });
        authorsByAbstract.set(a.abstractId, list);
      }
      for (const id of refIds) {
        const authors = authorsByAbstract.get(id) ?? [];
        const p = authors.find((x) => x.isPresenting) ?? authors[0];
        presentingById.set(
          id,
          p ? `${p.firstName} ${p.lastName}`.trim() || null : null,
        );
      }
    }

    const itemsBySession = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsBySession.get(item.sessionId) ?? [];
      list.push(item);
      itemsBySession.set(item.sessionId, list);
    }

    return [...sessions]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        id: s.id,
        title: s.title,
        sessionDate: s.sessionDate,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        location: s.location,
        moderator: s.moderator,
        sortOrder: s.sortOrder,
        items: (itemsBySession.get(s.id) ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => ({
            id: item.id,
            kind: item.kind,
            sortOrder: item.sortOrder,
            startsAt: item.startsAt,
            note: item.note,
            abstractId: item.abstractId,
            abstractNumber: item.abstractId
              ? numberById.get(item.abstractId) ?? null
              : null,
            abstractTitle: item.abstractId
              ? titleById.get(item.abstractId) ?? null
              : null,
            presentingAuthorName: item.abstractId
              ? presentingById.get(item.abstractId) ?? null
              : null,
            speakerId: item.speakerId,
            speakerName: item.speakerId
              ? speakerNameById.get(item.speakerId) ?? null
              : null,
            speakerTalkTitle: item.speakerId
              ? speakerTalkById.get(item.speakerId) ?? null
              : null,
            customTitle: item.customTitle,
          })),
      }));
  }

  // Program sessions. Chair/admin, except getPublicProgram which is public by
  // design and returns data only for a meeting at a public stage.
  const programSessions = {
    async listForEdition(
      actor: Actor,
      editionId: string,
    ): Promise<ProgramSessionResolved[]> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const sessions = await db
        .select()
        .from(schema.programSession)
        .where(eq(schema.programSession.editionId, editionId))
        .orderBy(schema.programSession.sortOrder);
      if (sessions.length === 0) return [];
      const items = await db
        .select()
        .from(schema.programItem)
        .where(
          inArray(
            schema.programItem.sessionId,
            sessions.map((s) => s.id),
          ),
        )
        .orderBy(schema.programItem.sortOrder);
      return resolveProgram(editionId, sessions, items);
    },

    async create(actor: Actor, input: ProgramSessionInput) {
      if (!isChair(actor, input.editionId)) throw new ForbiddenError();
      const title = input.title.trim();
      if (!title) throw new ValidationError("Session title is required.");
      const last = await db
        .select({ sortOrder: schema.programSession.sortOrder })
        .from(schema.programSession)
        .where(eq(schema.programSession.editionId, input.editionId))
        .orderBy(desc(schema.programSession.sortOrder))
        .limit(1);
      const nextOrder = (last[0]?.sortOrder ?? -1) + 1;
      const [created] = await db
        .insert(schema.programSession)
        .values({
          editionId: input.editionId,
          title,
          sessionDate: input.sessionDate ?? null,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          location: input.location?.trim() || null,
          moderator: input.moderator?.trim() || null,
          sortOrder: nextOrder,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, sessionId: string, patch: ProgramSessionPatch) {
      const session = await db.query.programSession.findFirst({
        where: eq(schema.programSession.id, sessionId),
      });
      if (!session) throw new NotFoundError();
      if (!isChair(actor, session.editionId)) throw new ForbiddenError();

      const set: Partial<typeof schema.programSession.$inferInsert> = {};
      if (patch.title !== undefined) {
        const t = patch.title.trim();
        if (!t) throw new ValidationError("Session title is required.");
        set.title = t;
      }
      if (patch.sessionDate !== undefined) set.sessionDate = patch.sessionDate;
      if (patch.startsAt !== undefined) set.startsAt = patch.startsAt;
      if (patch.endsAt !== undefined) set.endsAt = patch.endsAt;
      if (patch.location !== undefined) {
        set.location = patch.location?.trim() || null;
      }
      if (patch.moderator !== undefined) {
        set.moderator = patch.moderator?.trim() || null;
      }
      if (Object.keys(set).length > 0) {
        await db
          .update(schema.programSession)
          .set(set)
          .where(eq(schema.programSession.id, sessionId));
      }
      return db.query.programSession.findFirst({
        where: eq(schema.programSession.id, sessionId),
      });
    },

    async remove(actor: Actor, sessionId: string) {
      const session = await db.query.programSession.findFirst({
        where: eq(schema.programSession.id, sessionId),
      });
      if (!session) throw new NotFoundError();
      if (!isChair(actor, session.editionId)) throw new ForbiddenError();
      await db
        .delete(schema.programSession)
        .where(eq(schema.programSession.id, sessionId));
      return { id: sessionId };
    },

    async reorder(
      actor: Actor,
      editionId: string,
      orderedSessionIds: string[],
    ) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const existing = await db
        .select({ id: schema.programSession.id })
        .from(schema.programSession)
        .where(eq(schema.programSession.editionId, editionId));
      const validIds = new Set(existing.map((s) => s.id));
      let order = 0;
      for (const id of orderedSessionIds) {
        if (!validIds.has(id)) continue;
        await db
          .update(schema.programSession)
          .set({ sortOrder: order })
          .where(eq(schema.programSession.id, id));
        order += 1;
      }
      return { editionId };
    },

    // Public, not gated. Returns the program only when the meeting is at a public
    // stage; otherwise null so the route can show "coming soon". No confidential
    // or unaccepted content is exposed: items carry only titles, times, and the
    // presenting author.
    async getPublicProgram(editionId: string): Promise<PublicProgram | null> {
      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.id, editionId),
      });
      if (!ed) return null;
      if (!PROGRAM_PUBLIC_STATUSES.includes(ed.status)) return null;
      const sessions = await db
        .select()
        .from(schema.programSession)
        .where(eq(schema.programSession.editionId, editionId))
        .orderBy(schema.programSession.sortOrder);
      const items = sessions.length
        ? await db
            .select()
            .from(schema.programItem)
            .where(
              inArray(
                schema.programItem.sessionId,
                sessions.map((s) => s.id),
              ),
            )
            .orderBy(schema.programItem.sortOrder)
        : [];
      const resolved = await resolveProgram(editionId, sessions, items);

      const sponsorRows = await db
        .select({
          id: schema.sponsor.id,
          name: schema.sponsor.name,
          tier: schema.sponsor.tier,
          url: schema.sponsor.url,
          logoR2Key: schema.sponsor.logoR2Key,
        })
        .from(schema.sponsor)
        .where(eq(schema.sponsor.editionId, editionId))
        .orderBy(schema.sponsor.sortOrder, schema.sponsor.name);

      const speakerRows = await db
        .select({
          id: schema.invitedSpeaker.id,
          name: schema.invitedSpeaker.name,
          affiliation: schema.invitedSpeaker.affiliation,
          role: schema.invitedSpeaker.role,
          talkTitle: schema.invitedSpeaker.talkTitle,
          bio: schema.invitedSpeaker.bio,
        })
        .from(schema.invitedSpeaker)
        .where(eq(schema.invitedSpeaker.editionId, editionId))
        .orderBy(schema.invitedSpeaker.sortOrder, schema.invitedSpeaker.name);

      return {
        days: groupSessionsIntoDays(resolved),
        sponsors: sponsorRows,
        speakers: speakerRows,
      };
    },

    // Chair/admin builder read: the full schedule grouped by day and concurrency
    // (the same deterministic grouping the public view uses, so builder and
    // public agree), plus the meeting date range for the day tabs. Includes every
    // session regardless of edition status.
    async getScheduleForEdition(
      actor: Actor,
      editionId: string,
    ): Promise<ProgramSchedule> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.id, editionId),
      });
      if (!ed) throw new NotFoundError("meeting not found");
      const sessions = await db
        .select()
        .from(schema.programSession)
        .where(eq(schema.programSession.editionId, editionId))
        .orderBy(schema.programSession.sortOrder);
      const items = sessions.length
        ? await db
            .select()
            .from(schema.programItem)
            .where(
              inArray(
                schema.programItem.sessionId,
                sessions.map((s) => s.id),
              ),
            )
            .orderBy(schema.programItem.sortOrder)
        : [];
      const resolved = await resolveProgram(editionId, sessions, items);
      return {
        days: groupSessionsIntoDays(resolved),
        meetingStartsAt: ed.meetingStartsAt,
        meetingEndsAt: ed.meetingEndsAt,
      };
    },

    // Add a session that runs concurrently with an existing one: same day and
    // time window, a different room, so the two form a parallel-track slot.
    // Concurrency stays derived from the copied time window, never stored.
    async addConcurrentSession(
      actor: Actor,
      input: { sessionId: string; title: string; location?: string | null },
    ) {
      const source = await db.query.programSession.findFirst({
        where: eq(schema.programSession.id, input.sessionId),
      });
      if (!source) throw new NotFoundError("session not found");
      if (!isChair(actor, source.editionId)) throw new ForbiddenError();
      const title = input.title.trim();
      if (!title) throw new ValidationError("Session title is required.");

      const last = await db
        .select({ sortOrder: schema.programSession.sortOrder })
        .from(schema.programSession)
        .where(eq(schema.programSession.editionId, source.editionId))
        .orderBy(desc(schema.programSession.sortOrder))
        .limit(1);
      const nextOrder = (last[0]?.sortOrder ?? -1) + 1;
      const [created] = await db
        .insert(schema.programSession)
        .values({
          editionId: source.editionId,
          title,
          sessionDate: source.sessionDate,
          startsAt: source.startsAt,
          endsAt: source.endsAt,
          location: input.location?.trim() || null,
          sortOrder: nextOrder,
        })
        .returning();
      return created;
    },
  };

  // Program items within a session. Chair/admin. An item is either an accepted
  // abstract or a custom entry; that rule is enforced here.
  const programItems = {
    // Accepted abstracts in the meeting not yet placed in any session, for the
    // add-to-session picker, in book order.
    async listUnplacedAbstracts(
      actor: Actor,
      editionId: string,
    ): Promise<ProgramAbstractOption[]> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const numbered = await numberedAcceptedAbstracts(editionId);
      if (numbered.length === 0) return [];
      const placed = await db
        .select({ abstractId: schema.programItem.abstractId })
        .from(schema.programItem)
        .innerJoin(
          schema.programSession,
          eq(schema.programItem.sessionId, schema.programSession.id),
        )
        .where(eq(schema.programSession.editionId, editionId));
      const placedSet = new Set(
        placed.map((p) => p.abstractId).filter((x): x is string => x !== null),
      );
      return numbered.filter((n) => !placedSet.has(n.abstractId));
    },

    async addAbstract(
      actor: Actor,
      input: { sessionId: string; abstractId: string; kind?: ProgramItemKind },
    ) {
      const session = await db.query.programSession.findFirst({
        where: eq(schema.programSession.id, input.sessionId),
      });
      if (!session) throw new NotFoundError("session not found");
      if (!isChair(actor, session.editionId)) throw new ForbiddenError();
      const kind = assertKind(input.kind ?? "talk");

      const abs = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, input.abstractId),
      });
      if (!abs) throw new NotFoundError("abstract not found");
      if (abs.editionId !== session.editionId) {
        throw new ValidationError("That abstract belongs to a different meeting.");
      }
      if (abs.status !== "accepted") {
        throw new ValidationError(
          "Only accepted abstracts can be added to the program.",
        );
      }

      // One placement per abstract across the edition. The picker only offers
      // unplaced abstracts, so this guards direct calls and races.
      const existing = await db
        .select({ id: schema.programItem.id })
        .from(schema.programItem)
        .innerJoin(
          schema.programSession,
          eq(schema.programItem.sessionId, schema.programSession.id),
        )
        .where(
          and(
            eq(schema.programSession.editionId, session.editionId),
            eq(schema.programItem.abstractId, input.abstractId),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new AlreadyExistsError(
          "That abstract is already in the program. Remove it from its current session first.",
        );
      }

      const last = await db
        .select({ sortOrder: schema.programItem.sortOrder })
        .from(schema.programItem)
        .where(eq(schema.programItem.sessionId, input.sessionId))
        .orderBy(desc(schema.programItem.sortOrder))
        .limit(1);
      const nextOrder = (last[0]?.sortOrder ?? -1) + 1;
      // One-of rule: an abstract item sets abstractId only, leaving speakerId and
      // customTitle null.
      const [created] = await db
        .insert(schema.programItem)
        .values({
          sessionId: input.sessionId,
          abstractId: input.abstractId,
          kind,
          sortOrder: nextOrder,
        })
        .returning();
      return created;
    },

    // Attach an invited speaker to a session. The speaker must belong to the same
    // meeting. One-of rule: a speaker item sets speakerId only.
    async addSpeakerItem(
      actor: Actor,
      input: { sessionId: string; speakerId: string; kind?: ProgramItemKind },
    ) {
      const session = await db.query.programSession.findFirst({
        where: eq(schema.programSession.id, input.sessionId),
      });
      if (!session) throw new NotFoundError("session not found");
      if (!isChair(actor, session.editionId)) throw new ForbiddenError();

      const speaker = await db.query.invitedSpeaker.findFirst({
        where: eq(schema.invitedSpeaker.id, input.speakerId),
      });
      if (!speaker) throw new NotFoundError("speaker not found");
      if (speaker.editionId !== session.editionId) {
        throw new ValidationError("That speaker belongs to a different meeting.");
      }
      const kind = assertKind(input.kind ?? "keynote");

      const last = await db
        .select({ sortOrder: schema.programItem.sortOrder })
        .from(schema.programItem)
        .where(eq(schema.programItem.sessionId, input.sessionId))
        .orderBy(desc(schema.programItem.sortOrder))
        .limit(1);
      const nextOrder = (last[0]?.sortOrder ?? -1) + 1;
      const [created] = await db
        .insert(schema.programItem)
        .values({
          sessionId: input.sessionId,
          speakerId: input.speakerId,
          kind,
          sortOrder: nextOrder,
        })
        .returning();
      return created;
    },

    async addCustom(
      actor: Actor,
      input: {
        sessionId: string;
        customTitle: string;
        kind?: ProgramItemKind;
        note?: string;
        startsAt?: Date | null;
      },
    ) {
      const session = await db.query.programSession.findFirst({
        where: eq(schema.programSession.id, input.sessionId),
      });
      if (!session) throw new NotFoundError("session not found");
      if (!isChair(actor, session.editionId)) throw new ForbiddenError();
      const title = input.customTitle.trim();
      if (!title) throw new ValidationError("Item title is required.");
      const kind = assertKind(input.kind ?? "other");

      const last = await db
        .select({ sortOrder: schema.programItem.sortOrder })
        .from(schema.programItem)
        .where(eq(schema.programItem.sessionId, input.sessionId))
        .orderBy(desc(schema.programItem.sortOrder))
        .limit(1);
      const nextOrder = (last[0]?.sortOrder ?? -1) + 1;
      // One-of rule: a custom item sets customTitle only.
      const [created] = await db
        .insert(schema.programItem)
        .values({
          sessionId: input.sessionId,
          customTitle: title,
          kind,
          note: input.note?.trim() || null,
          startsAt: input.startsAt ?? null,
          sortOrder: nextOrder,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, itemId: string, patch: ProgramItemPatch) {
      const item = await db.query.programItem.findFirst({
        where: eq(schema.programItem.id, itemId),
      });
      if (!item) throw new NotFoundError();
      const session = await db.query.programSession.findFirst({
        where: eq(schema.programSession.id, item.sessionId),
      });
      if (!session) throw new NotFoundError();
      if (!isChair(actor, session.editionId)) throw new ForbiddenError();

      const set: Partial<typeof schema.programItem.$inferInsert> = {};
      if (patch.kind !== undefined) set.kind = assertKind(patch.kind);
      // customTitle applies to plain custom items only (no abstract, no speaker);
      // ignore it for abstract and speaker items.
      if (
        patch.customTitle !== undefined &&
        item.abstractId === null &&
        item.speakerId === null
      ) {
        const t = patch.customTitle.trim();
        if (!t) throw new ValidationError("Item title is required.");
        set.customTitle = t;
      }
      if (patch.note !== undefined) set.note = patch.note?.trim() || null;
      if (patch.startsAt !== undefined) set.startsAt = patch.startsAt;
      if (Object.keys(set).length > 0) {
        await db
          .update(schema.programItem)
          .set(set)
          .where(eq(schema.programItem.id, itemId));
      }
      return db.query.programItem.findFirst({
        where: eq(schema.programItem.id, itemId),
      });
    },

    async remove(actor: Actor, itemId: string) {
      const item = await db.query.programItem.findFirst({
        where: eq(schema.programItem.id, itemId),
      });
      if (!item) throw new NotFoundError();
      const session = await db.query.programSession.findFirst({
        where: eq(schema.programSession.id, item.sessionId),
      });
      if (!session) throw new NotFoundError();
      if (!isChair(actor, session.editionId)) throw new ForbiddenError();
      await db
        .delete(schema.programItem)
        .where(eq(schema.programItem.id, itemId));
      return { id: itemId };
    },

    async reorder(actor: Actor, sessionId: string, orderedItemIds: string[]) {
      const session = await db.query.programSession.findFirst({
        where: eq(schema.programSession.id, sessionId),
      });
      if (!session) throw new NotFoundError();
      if (!isChair(actor, session.editionId)) throw new ForbiddenError();
      const existing = await db
        .select({ id: schema.programItem.id })
        .from(schema.programItem)
        .where(eq(schema.programItem.sessionId, sessionId));
      const validIds = new Set(existing.map((i) => i.id));
      let order = 0;
      for (const id of orderedItemIds) {
        if (!validIds.has(id)) continue;
        await db
          .update(schema.programItem)
          .set({ sortOrder: order })
          .where(eq(schema.programItem.id, id));
        order += 1;
      }
      return { sessionId };
    },
  };

  const registrations = {
    // Attendee scoping: a user reads their own registration; a chair reads any
    // in the edition. The PayPal capture webhook flips status to paid out of band.
    // Bodies land in Part B once PayPal credentials exist.
    listForEdition(actor: Actor, editionId: string): Promise<unknown[]> {
      throw new Error("not implemented");
    },
    getMine(actor: Actor, editionId: string): Promise<unknown> {
      throw new Error("not implemented");
    },
    startCheckout(
      actor: Actor,
      input: { editionId: string; categoryId: string },
    ): Promise<{ approveUrl: string }> {
      // Creates a PayPal order and returns its approval link for the payer.
      throw new Error("not implemented");
    },
    markPaidFromWebhook(input: { paypalOrderId: string }): Promise<unknown> {
      // Called by the verified PayPal webhook, not by a user, so it has no Actor.
      throw new Error("not implemented");
    },
  };

  const editions = {
    // Admin view: every edition, newest first. The public listing (listPublic)
    // is a separate, narrower query added later.
    async list(actor: Actor) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      return db
        .select()
        .from(schema.edition)
        .orderBy(desc(schema.edition.year), desc(schema.edition.createdAt));
    },

    // Admin only. Season must be one of the two values and (season, year) must be
    // unique. The slug is derived from both, e.g. "spring-2027".
    async create(actor: Actor, input: EditionInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();

      if (input.season !== "spring" && input.season !== "fall") {
        throw new ValidationError("Season must be spring or fall.");
      }
      if (!Number.isInteger(input.year)) {
        throw new ValidationError("Year must be a whole number.");
      }
      const name = input.name.trim();
      if (!name) throw new ValidationError("Name is required.");

      const existing = await db.query.edition.findFirst({
        where: and(
          eq(schema.edition.season, input.season),
          eq(schema.edition.year, input.year),
        ),
      });
      if (existing) {
        throw new AlreadyExistsError(
          `A meeting for ${input.season} ${input.year} already exists.`,
        );
      }

      const [created] = await db
        .insert(schema.edition)
        .values({
          slug: `${input.season}-${input.year}`,
          name,
          season: input.season,
          year: input.year,
          status: input.status ?? "draft",
        })
        .returning();
      return created;
    },

    // Admin read of a single edition by id, for the edit and category screens.
    async getById(actor: Actor, editionId: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.edition.findFirst({
        where: eq(schema.edition.id, editionId),
      });
      if (!row) throw new NotFoundError();
      return row;
    },

    // Admin edit of status and the registration and submission windows. A
    // deadline cannot fall before its matching opens-at when both are set.
    async update(actor: Actor, editionId: string, patch: EditionPatch) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.edition.findFirst({
        where: eq(schema.edition.id, editionId),
      });
      if (!row) throw new NotFoundError();

      if (patch.status && !EDITION_STATUSES.includes(patch.status)) {
        throw new ValidationError("Unknown meeting status.");
      }

      const regOpens =
        patch.registrationOpensAt !== undefined
          ? patch.registrationOpensAt
          : row.registrationOpensAt;
      const regCloses =
        patch.registrationClosesAt !== undefined
          ? patch.registrationClosesAt
          : row.registrationClosesAt;
      if (regOpens && regCloses && regCloses.getTime() < regOpens.getTime()) {
        throw new ValidationError(
          "Registration deadline cannot be before registration opens.",
        );
      }

      const subOpens =
        patch.submissionOpensAt !== undefined
          ? patch.submissionOpensAt
          : row.submissionOpensAt;
      const subDeadline =
        patch.submissionDeadline !== undefined
          ? patch.submissionDeadline
          : row.submissionDeadline;
      if (subOpens && subDeadline && subDeadline.getTime() < subOpens.getTime()) {
        throw new ValidationError(
          "Submission deadline cannot be before submission opens.",
        );
      }

      const set: Partial<typeof schema.edition.$inferInsert> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.registrationOpensAt !== undefined) {
        set.registrationOpensAt = patch.registrationOpensAt;
      }
      if (patch.registrationClosesAt !== undefined) {
        set.registrationClosesAt = patch.registrationClosesAt;
      }
      if (patch.submissionOpensAt !== undefined) {
        set.submissionOpensAt = patch.submissionOpensAt;
      }
      if (patch.submissionDeadline !== undefined) {
        set.submissionDeadline = patch.submissionDeadline;
      }

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.edition)
          .set(set)
          .where(eq(schema.edition.id, editionId));
      }
      return this.getById(actor, editionId);
    },

    listPublic(): Promise<unknown[]> {
      throw new Error("not implemented");
    },

    // Public read by slug, used by the author submission routes to resolve a
    // meeting. No actor: it exposes only meeting metadata, not abstracts.
    async get(slug: string) {
      const row = await db.query.edition.findFirst({
        where: eq(schema.edition.slug, slug),
      });
      if (!row) throw new NotFoundError();
      return row;
    },
  };

  // Registration categories and fees, per edition. Admin only. Money is stored
  // in cents; the UI formats to dollars.
  const registrationCategories = {
    async listForEdition(actor: Actor, editionId: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      return db
        .select()
        .from(schema.registrationCategory)
        .where(eq(schema.registrationCategory.editionId, editionId))
        .orderBy(
          schema.registrationCategory.sortOrder,
          schema.registrationCategory.key,
        );
    },

    async create(actor: Actor, input: RegistrationCategoryInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();

      const label = input.label.trim();
      if (!label) throw new ValidationError("Label is required.");
      assertAmountCents(input.amountCents);
      if (!REGISTRATION_CATEGORY_KEYS.includes(input.key)) {
        throw new ValidationError(
          "Category type must be member, student, or nonmember.",
        );
      }

      const existing = await db.query.registrationCategory.findFirst({
        where: and(
          eq(schema.registrationCategory.editionId, input.editionId),
          eq(schema.registrationCategory.key, input.key),
        ),
      });
      if (existing) {
        throw new AlreadyExistsError(
          `A ${input.key} category already exists for this meeting.`,
        );
      }

      const [created] = await db
        .insert(schema.registrationCategory)
        .values({
          editionId: input.editionId,
          key: input.key,
          label,
          amountCents: input.amountCents,
          currency: normalizeCurrency(input.currency),
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: RegistrationCategoryPatch) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.registrationCategory.findFirst({
        where: eq(schema.registrationCategory.id, id),
      });
      if (!row) throw new NotFoundError();

      if (patch.label !== undefined && !patch.label.trim()) {
        throw new ValidationError("Label is required.");
      }
      if (patch.amountCents !== undefined) assertAmountCents(patch.amountCents);

      const set: Partial<typeof schema.registrationCategory.$inferInsert> = {};
      if (patch.label !== undefined) set.label = patch.label.trim();
      if (patch.amountCents !== undefined) set.amountCents = patch.amountCents;
      if (patch.currency !== undefined) {
        set.currency = normalizeCurrency(patch.currency);
      }
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
      if (patch.active !== undefined) set.active = patch.active;

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.registrationCategory)
          .set(set)
          .where(eq(schema.registrationCategory.id, id));
      }
      return db.query.registrationCategory.findFirst({
        where: eq(schema.registrationCategory.id, id),
      });
    },

    // Soft delete: the schema carries an active flag, so the row stays for
    // history and for any registration that already referenced it.
    async deactivate(actor: Actor, id: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.registrationCategory.findFirst({
        where: eq(schema.registrationCategory.id, id),
      });
      if (!row) throw new NotFoundError();
      await db
        .update(schema.registrationCategory)
        .set({ active: false })
        .where(eq(schema.registrationCategory.id, id));
      return { id, active: false };
    },
  };

  // Abstract categories, per edition. Admin manages them; authors read them to
  // pick one on the submission form. Hard delete is fine (no active flag).
  const abstractCategories = {
    async listForEdition(actor: Actor, editionId: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      return db
        .select()
        .from(schema.abstractCategory)
        .where(eq(schema.abstractCategory.editionId, editionId))
        .orderBy(schema.abstractCategory.sortOrder, schema.abstractCategory.name);
    },

    // Author-facing read for the submission form. Any signed-in user picks one,
    // so this is not admin-gated; it exposes only category names.
    async listForSubmission(editionId: string) {
      return db
        .select()
        .from(schema.abstractCategory)
        .where(eq(schema.abstractCategory.editionId, editionId))
        .orderBy(schema.abstractCategory.sortOrder, schema.abstractCategory.name);
    },

    async create(
      actor: Actor,
      input: { editionId: string; name: string; sortOrder?: number },
    ) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const name = input.name.trim();
      if (!name) throw new ValidationError("Name is required.");

      const existing = await db.query.abstractCategory.findFirst({
        where: and(
          eq(schema.abstractCategory.editionId, input.editionId),
          eq(schema.abstractCategory.name, name),
        ),
      });
      if (existing) {
        throw new AlreadyExistsError(
          `A category named "${name}" already exists for this meeting.`,
        );
      }

      const [created] = await db
        .insert(schema.abstractCategory)
        .values({
          editionId: input.editionId,
          name,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(
      actor: Actor,
      id: string,
      patch: { name?: string; sortOrder?: number },
    ) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.abstractCategory.findFirst({
        where: eq(schema.abstractCategory.id, id),
      });
      if (!row) throw new NotFoundError();

      const set: Partial<typeof schema.abstractCategory.$inferInsert> = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new ValidationError("Name is required.");
        if (name !== row.name) {
          const dupe = await db.query.abstractCategory.findFirst({
            where: and(
              eq(schema.abstractCategory.editionId, row.editionId),
              eq(schema.abstractCategory.name, name),
            ),
          });
          if (dupe) {
            throw new AlreadyExistsError(
              `A category named "${name}" already exists for this meeting.`,
            );
          }
        }
        set.name = name;
      }
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.abstractCategory)
          .set(set)
          .where(eq(schema.abstractCategory.id, id));
      }
      return db.query.abstractCategory.findFirst({
        where: eq(schema.abstractCategory.id, id),
      });
    },

    async remove(actor: Actor, id: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.abstractCategory.findFirst({
        where: eq(schema.abstractCategory.id, id),
      });
      if (!row) throw new NotFoundError();
      await db
        .delete(schema.abstractCategory)
        .where(eq(schema.abstractCategory.id, id));
      return { id };
    },
  };

  // Institution master list. Part of authoring, so any signed-in user may search
  // it and append to it (read-and-append only, no admin gating). The affiliation
  // autocomplete searches it; ensure is the self-grow path when an author types a
  // new institution. Dedup is by normalized_name.
  const institutions = {
    // Up to ten matches by substring on the normalized name, ordered by name.
    async search(actor: Actor, query: string) {
      const normalized = normalizeInstitutionName(query);
      if (!normalized) return [];
      // The normalized name has no % or _ (stripped in normalize), so it is safe
      // to interpolate into the LIKE pattern.
      return db
        .select({
          id: schema.institution.id,
          name: schema.institution.name,
          city: schema.institution.city,
          region: schema.institution.region,
          country: schema.institution.country,
        })
        .from(schema.institution)
        .where(like(schema.institution.normalizedName, `%${normalized}%`))
        .orderBy(schema.institution.name)
        .limit(10);
    },

    // Find by normalized name or insert a new one, then return it. Used on submit
    // when an author picked a free-text institution not already in the list.
    async ensure(
      actor: Actor,
      input: { name: string; city?: string; region?: string; country?: string },
    ) {
      const name = input.name.trim();
      if (!name) throw new ValidationError("Institution name is required.");
      const normalized = normalizeInstitutionName(name);

      const existing = await db.query.institution.findFirst({
        where: eq(schema.institution.normalizedName, normalized),
      });
      if (existing) return existing;

      await db
        .insert(schema.institution)
        .values({
          name,
          city: input.city?.trim() || null,
          region: input.region?.trim() || null,
          country: input.country?.trim() || "USA",
          normalizedName: normalized,
        })
        .onConflictDoNothing();

      const row = await db.query.institution.findFirst({
        where: eq(schema.institution.normalizedName, normalized),
      });
      if (!row) throw new ValidationError("Could not save the institution.");
      return row;
    },
  };

  // Invited speakers, per edition. Chair/admin only. The bio is sanitized to the
  // abstract body allowlist (em/sup/sub); name, affiliation, and talk title are
  // plain text and escaped at render time. The headshot r2 key is not written
  // here; upload is deferred.
  const invitedSpeakers = {
    async listForEdition(actor: Actor, editionId: string) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      return db
        .select()
        .from(schema.invitedSpeaker)
        .where(eq(schema.invitedSpeaker.editionId, editionId))
        .orderBy(schema.invitedSpeaker.sortOrder, schema.invitedSpeaker.name);
    },

    async create(actor: Actor, input: InvitedSpeakerInput) {
      if (!isChair(actor, input.editionId)) throw new ForbiddenError();
      const name = input.name.trim();
      if (!name) throw new ValidationError("Speaker name is required.");
      if (input.role != null && !SPEAKER_ROLES.includes(input.role)) {
        throw new ValidationError("Choose a valid speaker role.");
      }
      const bio = input.bio ? sanitizeBody(input.bio) : null;
      const [created] = await db
        .insert(schema.invitedSpeaker)
        .values({
          editionId: input.editionId,
          name,
          affiliation: input.affiliation?.trim() || null,
          role: input.role ?? null,
          talkTitle: input.talkTitle?.trim() || null,
          bio: bio && !isEmptyRichText(bio) ? bio : null,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: InvitedSpeakerPatch) {
      const row = await db.query.invitedSpeaker.findFirst({
        where: eq(schema.invitedSpeaker.id, id),
      });
      if (!row) throw new NotFoundError();
      if (!isChair(actor, row.editionId)) throw new ForbiddenError();

      const set: Partial<typeof schema.invitedSpeaker.$inferInsert> = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new ValidationError("Speaker name is required.");
        set.name = name;
      }
      if (patch.affiliation !== undefined) {
        set.affiliation = patch.affiliation?.trim() || null;
      }
      if (patch.role !== undefined) {
        if (patch.role != null && !SPEAKER_ROLES.includes(patch.role)) {
          throw new ValidationError("Choose a valid speaker role.");
        }
        set.role = patch.role ?? null;
      }
      if (patch.talkTitle !== undefined) {
        set.talkTitle = patch.talkTitle?.trim() || null;
      }
      if (patch.bio !== undefined) {
        const bio = patch.bio ? sanitizeBody(patch.bio) : null;
        set.bio = bio && !isEmptyRichText(bio) ? bio : null;
      }
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.invitedSpeaker)
          .set(set)
          .where(eq(schema.invitedSpeaker.id, id));
      }
      return db.query.invitedSpeaker.findFirst({
        where: eq(schema.invitedSpeaker.id, id),
      });
    },

    async remove(actor: Actor, id: string) {
      const row = await db.query.invitedSpeaker.findFirst({
        where: eq(schema.invitedSpeaker.id, id),
      });
      if (!row) throw new NotFoundError();
      if (!isChair(actor, row.editionId)) throw new ForbiddenError();
      // program_item.speaker_id is ON DELETE SET NULL, so any item pointing here
      // keeps its slot and falls back to its kind label.
      await db
        .delete(schema.invitedSpeaker)
        .where(eq(schema.invitedSpeaker.id, id));
      return { id };
    },
  };

  // Sponsors, per edition. Chair/admin only. All fields are plain text and
  // escaped at render time. The logo r2 key is not written here; upload is
  // deferred.
  const sponsors = {
    async listForEdition(actor: Actor, editionId: string) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      return db
        .select()
        .from(schema.sponsor)
        .where(eq(schema.sponsor.editionId, editionId))
        .orderBy(schema.sponsor.sortOrder, schema.sponsor.name);
    },

    async create(actor: Actor, input: SponsorInput) {
      if (!isChair(actor, input.editionId)) throw new ForbiddenError();
      const name = input.name.trim();
      if (!name) throw new ValidationError("Sponsor name is required.");
      const [created] = await db
        .insert(schema.sponsor)
        .values({
          editionId: input.editionId,
          name,
          tier: input.tier?.trim() || null,
          url: input.url?.trim() || null,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: SponsorPatch) {
      const row = await db.query.sponsor.findFirst({
        where: eq(schema.sponsor.id, id),
      });
      if (!row) throw new NotFoundError();
      if (!isChair(actor, row.editionId)) throw new ForbiddenError();

      const set: Partial<typeof schema.sponsor.$inferInsert> = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new ValidationError("Sponsor name is required.");
        set.name = name;
      }
      if (patch.tier !== undefined) set.tier = patch.tier?.trim() || null;
      if (patch.url !== undefined) set.url = patch.url?.trim() || null;
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db.update(schema.sponsor).set(set).where(eq(schema.sponsor.id, id));
      }
      return db.query.sponsor.findFirst({ where: eq(schema.sponsor.id, id) });
    },

    async remove(actor: Actor, id: string) {
      const row = await db.query.sponsor.findFirst({
        where: eq(schema.sponsor.id, id),
      });
      if (!row) throw new NotFoundError();
      if (!isChair(actor, row.editionId)) throw new ForbiddenError();
      await db.delete(schema.sponsor).where(eq(schema.sponsor.id, id));
      return { id };
    },
  };

  // Awards. The branch's named awards. Definitions are a public read (the
  // awardees index and per-award pages); create/update/remove are platform-admin
  // only. namesakeBio/description are sanitized to the em/sup/sub allowlist on
  // write, so stored HTML is safe to render verbatim.
  const awards = {
    async listAll() {
      return db
        .select()
        .from(schema.award)
        .orderBy(schema.award.sortOrder, schema.award.name);
    },

    // One award plus its recipients grouped by year and category. Public.
    async getBySlug(slug: string) {
      const awardRow = await db.query.award.findFirst({
        where: eq(schema.award.slug, slug),
      });
      if (!awardRow) throw new NotFoundError("award not found");
      const rows = await db
        .select({
          id: schema.awardRecipient.id,
          year: schema.awardRecipient.year,
          category: schema.awardRecipient.category,
          placement: schema.awardRecipient.placement,
          personName: schema.awardRecipient.personName,
          institution: schema.awardRecipient.institution,
          mentor: schema.awardRecipient.mentor,
          editionId: schema.awardRecipient.editionId,
        })
        .from(schema.awardRecipient)
        .where(eq(schema.awardRecipient.awardId, awardRow.id))
        .orderBy(
          schema.awardRecipient.sortOrder,
          schema.awardRecipient.personName,
        );
      return { award: awardRow, years: groupRecipientsByYear(rows) };
    },

    async create(actor: Actor, input: AwardInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const slug = normalizeAwardSlug(input.slug || input.name || "");
      if (!slug) throw new ValidationError("Award slug is required.");
      const name = input.name.trim();
      if (!name) throw new ValidationError("Award name is required.");
      const existing = await db.query.award.findFirst({
        where: eq(schema.award.slug, slug),
      });
      if (existing) {
        throw new AlreadyExistsError(
          `An award with slug "${slug}" already exists.`,
        );
      }
      const namesakeBio = sanitizeAwardHtml(input.namesakeBio);
      const description = sanitizeAwardHtml(input.description);
      const [created] = await db
        .insert(schema.award)
        .values({
          slug,
          name,
          namesakeBio,
          description,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: AwardPatch) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.award.findFirst({
        where: eq(schema.award.id, id),
      });
      if (!row) throw new NotFoundError();

      const set: Partial<typeof schema.award.$inferInsert> = {};
      if (patch.slug !== undefined) {
        const slug = normalizeAwardSlug(patch.slug);
        if (!slug) throw new ValidationError("Award slug is required.");
        if (slug !== row.slug) {
          const clash = await db.query.award.findFirst({
            where: eq(schema.award.slug, slug),
          });
          if (clash) {
            throw new AlreadyExistsError(
              `An award with slug "${slug}" already exists.`,
            );
          }
        }
        set.slug = slug;
      }
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new ValidationError("Award name is required.");
        set.name = name;
      }
      if (patch.namesakeBio !== undefined) {
        set.namesakeBio = sanitizeAwardHtml(patch.namesakeBio);
      }
      if (patch.description !== undefined) {
        set.description = sanitizeAwardHtml(patch.description);
      }
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db.update(schema.award).set(set).where(eq(schema.award.id, id));
      }
      return db.query.award.findFirst({ where: eq(schema.award.id, id) });
    },

    async remove(actor: Actor, id: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.award.findFirst({
        where: eq(schema.award.id, id),
      });
      if (!row) throw new NotFoundError();
      // award_recipient.award_id is ON DELETE CASCADE, so recipients go with it.
      await db.delete(schema.award).where(eq(schema.award.id, id));
      return { id };
    },
  };

  // Award recipients. listForAward is public; writes are admin, or a chair of the
  // edition a recipient is tied to (the every-meeting maintenance path). A
  // recipient with no edition is admin-only. personName and year are required.
  const awardRecipients = {
    async listForAward(awardId: string): Promise<AwardRecipientView[]> {
      return db
        .select({
          id: schema.awardRecipient.id,
          year: schema.awardRecipient.year,
          category: schema.awardRecipient.category,
          placement: schema.awardRecipient.placement,
          personName: schema.awardRecipient.personName,
          institution: schema.awardRecipient.institution,
          mentor: schema.awardRecipient.mentor,
          editionId: schema.awardRecipient.editionId,
        })
        .from(schema.awardRecipient)
        .where(eq(schema.awardRecipient.awardId, awardId))
        .orderBy(
          schema.awardRecipient.sortOrder,
          schema.awardRecipient.personName,
        );
    },

    async create(actor: Actor, input: AwardRecipientInput) {
      requireRecipientWriter(actor, input.editionId ?? null);
      const parent = await db.query.award.findFirst({
        where: eq(schema.award.id, input.awardId),
      });
      if (!parent) throw new NotFoundError("award not found");
      const values = validateRecipient(input);
      const [created] = await db
        .insert(schema.awardRecipient)
        .values({ awardId: input.awardId, ...values })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: AwardRecipientPatch) {
      const row = await db.query.awardRecipient.findFirst({
        where: eq(schema.awardRecipient.id, id),
      });
      if (!row) throw new NotFoundError();
      // The actor must be allowed for the recipient's current edition, and, when
      // moving it to another edition, for the destination too.
      requireRecipientWriter(actor, row.editionId);
      if (patch.editionId !== undefined) {
        requireRecipientWriter(actor, patch.editionId ?? null);
      }

      const set: Partial<typeof schema.awardRecipient.$inferInsert> = {};
      if (patch.editionId !== undefined) set.editionId = patch.editionId ?? null;
      if (patch.year !== undefined) {
        const year = patch.year.trim();
        if (!year) throw new ValidationError("Year is required.");
        set.year = year;
      }
      if (patch.category !== undefined) {
        set.category = patch.category?.trim() || null;
      }
      if (patch.placement !== undefined) {
        set.placement = patch.placement?.trim() || null;
      }
      if (patch.personName !== undefined) {
        const personName = patch.personName.trim();
        if (!personName) throw new ValidationError("Recipient name is required.");
        set.personName = personName;
      }
      if (patch.institution !== undefined) {
        set.institution = patch.institution?.trim() || null;
      }
      if (patch.mentor !== undefined) set.mentor = patch.mentor?.trim() || null;
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.awardRecipient)
          .set(set)
          .where(eq(schema.awardRecipient.id, id));
      }
      return db.query.awardRecipient.findFirst({
        where: eq(schema.awardRecipient.id, id),
      });
    },

    async remove(actor: Actor, id: string) {
      const row = await db.query.awardRecipient.findFirst({
        where: eq(schema.awardRecipient.id, id),
      });
      if (!row) throw new NotFoundError();
      requireRecipientWriter(actor, row.editionId);
      await db
        .delete(schema.awardRecipient)
        .where(eq(schema.awardRecipient.id, id));
      return { id };
    },

    // Public search across person, institution, mentor, year, and award name and
    // slug, with optional award/year/institution filters. Every term is bound as
    // a query parameter (drizzle `like`/`eq`), never string-interpolated.
    async search(
      query: string,
      filters: AwardSearchFilters = {},
    ): Promise<AwardSearchResult[]> {
      const term = query.trim();
      const conditions = [];
      if (term) {
        const pattern = `%${term}%`;
        conditions.push(
          or(
            like(schema.awardRecipient.personName, pattern),
            like(schema.awardRecipient.institution, pattern),
            like(schema.awardRecipient.mentor, pattern),
            like(schema.awardRecipient.year, pattern),
            like(schema.award.name, pattern),
            like(schema.award.slug, pattern),
          ),
        );
      }
      if (filters.awardSlug) {
        conditions.push(eq(schema.award.slug, filters.awardSlug));
      }
      if (filters.year) {
        conditions.push(eq(schema.awardRecipient.year, filters.year));
      }
      if (filters.institution) {
        conditions.push(
          like(schema.awardRecipient.institution, `%${filters.institution}%`),
        );
      }

      return db
        .select({
          id: schema.awardRecipient.id,
          year: schema.awardRecipient.year,
          category: schema.awardRecipient.category,
          placement: schema.awardRecipient.placement,
          personName: schema.awardRecipient.personName,
          institution: schema.awardRecipient.institution,
          mentor: schema.awardRecipient.mentor,
          editionId: schema.awardRecipient.editionId,
          awardSlug: schema.award.slug,
          awardName: schema.award.name,
        })
        .from(schema.awardRecipient)
        .innerJoin(
          schema.award,
          eq(schema.awardRecipient.awardId, schema.award.id),
        )
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(
          desc(schema.awardRecipient.year),
          schema.award.sortOrder,
          schema.awardRecipient.sortOrder,
        )
        .limit(200);
    },
  };

  // Platform settings: the single org-identity-and-defaults row. get() is a
  // public read used by the shell, creating the row with named defaults on first
  // read if it is missing. update() is platform-admin only.
  const settings = {
    async get(): Promise<PlatformSettings> {
      const existing = await db.query.platformSettings.findFirst({
        where: eq(schema.platformSettings.id, PLATFORM_SETTINGS_ID),
      });
      if (existing) return resolveSettings(existing);
      // First-read fallback for an unseeded database. Identity stays blank for an
      // admin to fill in; the tunable defaults come from the named vocab config.
      const [created] = await db
        .insert(schema.platformSettings)
        .values({
          id: PLATFORM_SETTINGS_ID,
          defaultCurrency: DEFAULT_CURRENCY,
          defaultAbstractWordLimit: DEFAULT_WORD_LIMIT,
        })
        .onConflictDoNothing()
        .returning();
      if (created) return resolveSettings(created);
      // A concurrent first read won the insert; read it back.
      const row = await db.query.platformSettings.findFirst({
        where: eq(schema.platformSettings.id, PLATFORM_SETTINGS_ID),
      });
      if (!row) throw new NotFoundError("settings not found");
      return resolveSettings(row);
    },

    async update(
      actor: Actor,
      patch: PlatformSettingsPatch,
    ): Promise<PlatformSettings> {
      if (!isAdmin(actor)) throw new ForbiddenError();

      const set: Partial<typeof schema.platformSettings.$inferInsert> = {};
      if (patch.orgName !== undefined) set.orgName = patch.orgName.trim() || null;
      if (patch.shortName !== undefined) {
        set.shortName = patch.shortName.trim() || null;
      }
      if (patch.orgFullName !== undefined) {
        set.orgFullName = patch.orgFullName.trim() || null;
      }
      if (patch.tagline !== undefined) set.tagline = patch.tagline.trim() || null;
      if (patch.foundingYear !== undefined) {
        if (patch.foundingYear !== null) {
          if (
            !Number.isInteger(patch.foundingYear) ||
            patch.foundingYear < 1800 ||
            patch.foundingYear > 2200
          ) {
            throw new ValidationError("Enter a valid founding year.");
          }
        }
        set.foundingYear = patch.foundingYear;
      }
      if (patch.contactEmail !== undefined) {
        const email = patch.contactEmail?.trim() ?? "";
        if (email && !email.includes("@")) {
          throw new ValidationError("Enter a valid contact email.");
        }
        set.contactEmail = email || null;
      }
      if (patch.facebookUrl !== undefined) {
        const url = patch.facebookUrl?.trim() ?? "";
        if (url && !/^https?:\/\//i.test(url)) {
          throw new ValidationError("The Facebook URL must start with http.");
        }
        set.facebookUrl = url || null;
      }
      if (patch.footerLinks !== undefined) {
        set.footerLinks = JSON.stringify(cleanFooterLinks(patch.footerLinks));
      }
      if (patch.defaultCurrency !== undefined) {
        set.defaultCurrency = normalizeCurrency(patch.defaultCurrency);
      }
      if (patch.defaultAbstractWordLimit !== undefined) {
        if (
          !Number.isInteger(patch.defaultAbstractWordLimit) ||
          patch.defaultAbstractWordLimit < 1
        ) {
          throw new ValidationError(
            "The default word limit must be a whole number of one or more.",
          );
        }
        set.defaultAbstractWordLimit = patch.defaultAbstractWordLimit;
      }

      // Ensure the row exists, then apply. get() handles create-on-first-read.
      await this.get();
      if (Object.keys(set).length > 0) {
        await db
          .update(schema.platformSettings)
          .set(set)
          .where(eq(schema.platformSettings.id, PLATFORM_SETTINGS_ID));
      }
      return this.get();
    },
  };

  // Program document data. Assembles the front matter, the day-and-concurrency
  // schedule (moderators and items resolved), the invited speakers, and the
  // sponsors for the printable program. Chair/admin only. The return is plain
  // data so renderProgramBook in ./program-book is a pure function of it.
  const program = {
    async getProgramData(
      actor: Actor,
      editionId: string,
    ): Promise<ProgramBookData> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.id, editionId),
      });
      if (!ed) throw new NotFoundError("meeting not found");

      const settingsRow = await db.query.platformSettings.findFirst({
        where: eq(schema.platformSettings.id, PLATFORM_SETTINGS_ID),
      });
      const identity = settingsRow ? resolveSettings(settingsRow) : null;

      const sessions = await db
        .select()
        .from(schema.programSession)
        .where(eq(schema.programSession.editionId, editionId))
        .orderBy(schema.programSession.sortOrder);
      const items = sessions.length
        ? await db
            .select()
            .from(schema.programItem)
            .where(
              inArray(
                schema.programItem.sessionId,
                sessions.map((s) => s.id),
              ),
            )
            .orderBy(schema.programItem.sortOrder)
        : [];
      const resolved = await resolveProgram(editionId, sessions, items);

      const speakers = await db
        .select({
          id: schema.invitedSpeaker.id,
          name: schema.invitedSpeaker.name,
          affiliation: schema.invitedSpeaker.affiliation,
          role: schema.invitedSpeaker.role,
          talkTitle: schema.invitedSpeaker.talkTitle,
          bio: schema.invitedSpeaker.bio,
        })
        .from(schema.invitedSpeaker)
        .where(eq(schema.invitedSpeaker.editionId, editionId))
        .orderBy(schema.invitedSpeaker.sortOrder, schema.invitedSpeaker.name);

      const sponsors = await db
        .select({
          id: schema.sponsor.id,
          name: schema.sponsor.name,
          tier: schema.sponsor.tier,
          url: schema.sponsor.url,
          logoR2Key: schema.sponsor.logoR2Key,
        })
        .from(schema.sponsor)
        .where(eq(schema.sponsor.editionId, editionId))
        .orderBy(schema.sponsor.sortOrder, schema.sponsor.name);

      return {
        meeting: {
          name: ed.name,
          meetingStartsAt: ed.meetingStartsAt,
          meetingEndsAt: ed.meetingEndsAt,
          venueName: ed.venueName,
          city: ed.city,
          orgName: identity?.orgName ?? "",
          orgFullName: identity?.orgFullName ?? "",
          shortName: identity?.shortName ?? "",
        },
        days: groupSessionsIntoDays(resolved),
        speakers,
        sponsors,
      };
    },
  };

  // The single generated document for a meeting in one category (abstract book
  // or program), whatever its status. One row per (edition, category) with
  // source "generated"; a regenerate reuses it.
  async function findGeneratedDoc(
    editionId: string,
    category: DocumentCategory,
  ) {
    return db.query.document.findFirst({
      where: and(
        eq(schema.document.editionId, editionId),
        eq(schema.document.category, category),
        eq(schema.document.source, "generated"),
      ),
    });
  }

  // Documents: one model for every branch PDF, generated or uploaded. Public
  // reads return published rows only. The generate-record flow writes generated
  // rows (source "generated") and tracks the run through genStatus, keeping the
  // one-per-category-per-edition rule so a regenerate updates the same row and
  // an existing PDF stays downloadable until the new one is ready. publish flips
  // a ready generated row (or an uploaded row) to published. create/update/
  // remove maintain uploaded archive documents. Writes are admin, or a chair of
  // the document's meeting; a document with no meeting is admin-only.
  const documents = {
    // Every published document in a category, for a public archive page.
    async listByCategory(category: DocumentCategory) {
      return db
        .select()
        .from(schema.document)
        .where(
          and(
            eq(schema.document.category, category),
            eq(schema.document.status, "published"),
          ),
        )
        .orderBy(
          schema.document.sortOrder,
          desc(schema.document.year),
          schema.document.title,
        );
    },

    // One published document by its unique slug, or null. Viewing writes nothing.
    async getBySlug(slug: string) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.slug, slug),
      });
      if (!row || row.status !== "published") return null;
      return row;
    },

    // Published documents tied to a meeting (its book, program, and any uploaded
    // archive PDFs), for the meeting's public archive section.
    async listForEdition(editionId: string) {
      return db
        .select()
        .from(schema.document)
        .where(
          and(
            eq(schema.document.editionId, editionId),
            eq(schema.document.status, "published"),
          ),
        )
        .orderBy(schema.document.sortOrder, schema.document.title);
    },

    // Chair/admin read of a meeting's generated document in one category, for the
    // admin panel and the download route. Null when nothing is generated yet.
    async getGeneratedForEdition(
      actor: Actor,
      editionId: string,
      category: DocumentCategory,
    ) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const row = await findGeneratedDoc(editionId, category);
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        genStatus: row.genStatus,
        r2Key: row.r2Key,
        fileName: row.fileName,
        abstractCount: row.abstractCount,
        generatedAt: row.generatedAt,
        updatedAt: row.updatedAt,
      };
    },

    // Create an uploaded archive document. The R2 write happens in the route;
    // this stores the metadata row.
    async create(actor: Actor, input: DocumentUploadInput) {
      assertDocumentWrite(actor, input.editionId ?? null);
      const category = assertDocumentCategory(input.category);
      const title = input.title.trim();
      if (!title) throw new ValidationError("Document title is required.");
      const slug = normalizeDocumentSlug(input.slug || title);
      if (!slug) throw new ValidationError("Document slug is required.");
      const clash = await db.query.document.findFirst({
        where: eq(schema.document.slug, slug),
      });
      if (clash) {
        throw new AlreadyExistsError(
          `A document with slug "${slug}" already exists.`,
        );
      }
      const [created] = await db
        .insert(schema.document)
        .values({
          category,
          source: "uploaded",
          status: "draft",
          title,
          year: input.year ?? null,
          season: input.season ?? null,
          editionId: input.editionId ?? null,
          editor: input.editor?.trim() || null,
          r2Key: input.r2Key ?? null,
          fileName: input.fileName ?? null,
          slug,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: DocumentPatch) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.id, id),
      });
      if (!row) throw new NotFoundError();
      assertDocumentWrite(actor, row.editionId);

      const set: Partial<typeof schema.document.$inferInsert> = {};
      if (patch.category !== undefined) {
        set.category = assertDocumentCategory(patch.category);
      }
      if (patch.status !== undefined) {
        if (!DOCUMENT_STATUSES.includes(patch.status)) {
          throw new ValidationError("Choose a valid document status.");
        }
        set.status = patch.status;
      }
      if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (!title) throw new ValidationError("Document title is required.");
        set.title = title;
      }
      if (patch.slug !== undefined) {
        const slug = normalizeDocumentSlug(patch.slug);
        if (!slug) throw new ValidationError("Document slug is required.");
        if (slug !== row.slug) {
          const clash = await db.query.document.findFirst({
            where: eq(schema.document.slug, slug),
          });
          if (clash) {
            throw new AlreadyExistsError(
              `A document with slug "${slug}" already exists.`,
            );
          }
        }
        set.slug = slug;
      }
      if (patch.year !== undefined) set.year = patch.year;
      if (patch.season !== undefined) set.season = patch.season;
      if (patch.editionId !== undefined) set.editionId = patch.editionId;
      if (patch.editor !== undefined) set.editor = patch.editor?.trim() || null;
      if (patch.r2Key !== undefined) set.r2Key = patch.r2Key;
      if (patch.fileName !== undefined) set.fileName = patch.fileName;
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.document)
          .set(set)
          .where(eq(schema.document.id, id));
      }
      return db.query.document.findFirst({ where: eq(schema.document.id, id) });
    },

    // Remove a document row. Returns its r2Key so the route can delete the R2
    // object; this layer touches metadata only.
    async remove(actor: Actor, id: string) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.id, id),
      });
      if (!row) throw new NotFoundError();
      assertDocumentWrite(actor, row.editionId);
      await db.delete(schema.document).where(eq(schema.document.id, id));
      return { id, r2Key: row.r2Key };
    },

    // Mark a generated document generating before the Browser Rendering call
    // (which happens in the route where env.BROWSER is in scope). Rejects a
    // second concurrent run: if the row is already generating and was set
    // recently, the caller should wait. A stale generating row (from a crashed
    // run) is allowed to restart. The previous r2Key is kept so an existing PDF
    // stays downloadable until the new one is ready.
    async recordGenerating(
      actor: Actor,
      input: { editionId: string; category: DocumentCategory },
    ) {
      const { editionId } = input;
      const category = assertDocumentCategory(input.category);
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.id, editionId),
      });
      if (!ed) throw new NotFoundError("meeting not found");

      const STALE_MS = 5 * 60 * 1000;
      const existing = await findGeneratedDoc(editionId, category);
      if (existing && existing.genStatus === "generating") {
        const age = Date.now() - existing.updatedAt.getTime();
        if (age < STALE_MS) {
          throw new ValidationError(
            "A document is already being generated for this meeting. Give it a minute, then refresh.",
          );
        }
      }
      if (existing) {
        await db
          .update(schema.document)
          .set({ genStatus: "generating", generatedById: actor.userId })
          .where(eq(schema.document.id, existing.id));
        return { id: existing.id };
      }
      const meta = generatedDocMeta(category, ed);
      const [created] = await db
        .insert(schema.document)
        .values({
          category,
          source: "generated",
          status: "draft",
          title: meta.title,
          slug: meta.slug,
          year: meta.year,
          season: meta.season,
          editionId,
          genStatus: "generating",
          generatedById: actor.userId,
        })
        .returning();
      return { id: created.id };
    },

    // Mark a generated document ready after its PDF is stored in R2. Keeps the
    // draft/published status untouched, so a regenerate of a published document
    // stays published.
    async recordReady(
      actor: Actor,
      id: string,
      input: { r2Key: string; fileName: string; abstractCount?: number },
    ) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.id, id),
      });
      if (!row) throw new NotFoundError();
      assertDocumentWrite(actor, row.editionId);
      await db
        .update(schema.document)
        .set({
          genStatus: "ready",
          r2Key: input.r2Key,
          fileName: input.fileName,
          abstractCount: input.abstractCount ?? null,
          generatedById: actor.userId,
          generatedAt: new Date(),
        })
        .where(eq(schema.document.id, id));
      return { id };
    },

    // Mark a generated document failed so the UI can show it and the chair can
    // retry.
    async recordFailed(actor: Actor, id: string) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.id, id),
      });
      if (!row) return { id: null };
      assertDocumentWrite(actor, row.editionId);
      await db
        .update(schema.document)
        .set({ genStatus: "failed" })
        .where(eq(schema.document.id, id));
      return { id };
    },

    // Flip a document to published. A generated document must be ready first; an
    // uploaded document can publish directly.
    async publish(actor: Actor, id: string) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.id, id),
      });
      if (!row) throw new NotFoundError();
      assertDocumentWrite(actor, row.editionId);
      if (row.source === "generated" && row.genStatus !== "ready") {
        throw new ValidationError(
          "Generate the document before publishing it.",
        );
      }
      await db
        .update(schema.document)
        .set({ status: "published" })
        .where(eq(schema.document.id, id));
      return { id };
    },
  };

  return {
    abstracts,
    reviews,
    roles,
    decisions,
    books,
    programSessions,
    programItems,
    program,
    documents,
    invitedSpeakers,
    sponsors,
    awards,
    awardRecipients,
    institutions,
    registrations,
    editions,
    registrationCategories,
    abstractCategories,
    settings,
  };
}

export type DataAccess = ReturnType<typeof createDataAccess>;

// Entry point for loaders and actions: build the data-access layer from the
// request environment (context.cloudflare.env). This is the only data path the
// rest of the app imports; nothing else reaches the Drizzle client or schema.
export function getDataAccess(env: Env) {
  return createDataAccess(getDb(env));
}

// Resolve the acting user's grants through the data-access layer. Used by the
// auth helpers to decide admin access without touching the Drizzle client.
export function getActor(env: Env, userId: string): Promise<Actor> {
  return loadActor(getDb(env), userId);
}

// ---------------------------------------------------------------------------
// Meeting import. A server-only, clearly-named path used by the offline
// archive-import script (scripts/import-meeting.ts) to seed a past meeting so
// its abstracts are indistinguishable from live submissions: the same title and
// body sanitizers and the same validation run. It is deliberately NOT part of
// the createDataAccess() surface, so routes cannot reach it. It does not weaken
// any live gating: every function is admin/chair gated, and it only bypasses the
// submission-window check that live create enforces, which is meaningless for an
// archived meeting. Authors and affiliations still go through the normal
// abstracts.setAuthors / setAffiliations (an admin actor is a chair of every
// meeting, so those work past the deadline without loosening anything).
// ---------------------------------------------------------------------------

// A fixed system account that owns imported abstracts (abstract.submitterId is
// notnull). It is not a real sign-in account; the id is stable so re-imports do
// not multiply system users.
export const SYSTEM_IMPORT_USER_ID = "system-import";
const SYSTEM_IMPORT_USER_EMAIL = "import@system.txasm.invalid";

export interface ImportEditionInput {
  slug: string;
  name: string;
  season: Season;
  year: number;
  status: EditionStatus;
  meetingStartsAt?: Date | null;
  meetingEndsAt?: Date | null;
  venueName?: string | null;
  city?: string | null;
}

export interface ImportAbstractInput {
  editionId: string;
  submitterId: string;
  title: string; // raw em/sup/sub markup, sanitized here
  body: string; // raw em/sup/sub markup, sanitized here
  level: AbstractLevel;
  format: AbstractFormat;
  // The topic category, or null for abstracts the source does not categorize by
  // topic (in the archive, oral presentations are grouped by level, not topic).
  // The abstract.category_id column is nullable, so this needs no schema change.
  categoryId: string | null;
}

export function createMeetingImporter(db: DB) {
  // Upsert the system import user and return its id. Safe to call repeatedly.
  async function ensureSystemUser(): Promise<string> {
    await db
      .insert(schema.user)
      .values({
        id: SYSTEM_IMPORT_USER_ID,
        email: SYSTEM_IMPORT_USER_EMAIL,
        name: "Meeting Import",
        emailVerified: true,
      })
      .onConflictDoNothing();
    return SYSTEM_IMPORT_USER_ID;
  }

  // Create an archived edition with the full front matter (slug, dates, venue),
  // which the live editions.create path does not set. Admin only. Refuses a
  // duplicate slug so a re-run does not create a second meeting.
  async function createArchivedEdition(actor: Actor, input: ImportEditionInput) {
    if (!isAdmin(actor)) throw new ForbiddenError();
    if (!SEASONS.includes(input.season)) {
      throw new ValidationError("Season must be spring or fall.");
    }
    if (!EDITION_STATUSES.includes(input.status)) {
      throw new ValidationError("Unknown meeting status.");
    }
    if (!Number.isInteger(input.year)) {
      throw new ValidationError("Year must be a whole number.");
    }
    const slug = input.slug.trim();
    if (!slug) throw new ValidationError("Meeting slug is required.");
    const name = input.name.trim();
    if (!name) throw new ValidationError("Meeting name is required.");

    const existing = await db.query.edition.findFirst({
      where: eq(schema.edition.slug, slug),
    });
    if (existing) {
      throw new AlreadyExistsError(`A meeting with slug "${slug}" already exists.`);
    }

    const [created] = await db
      .insert(schema.edition)
      .values({
        slug,
        name,
        season: input.season,
        year: input.year,
        status: input.status,
        meetingStartsAt: input.meetingStartsAt ?? null,
        meetingEndsAt: input.meetingEndsAt ?? null,
        venueName: input.venueName?.trim() || null,
        city: input.city?.trim() || null,
      })
      .returning();
    return created;
  }

  // Create one accepted abstract, running the same title and body sanitizers and
  // the same axis validation as live submission. Chair/admin of the meeting only.
  // Status is set to accepted directly (archived meeting), skipping only the
  // submission-window check that is meaningless here.
  async function createAcceptedAbstract(
    actor: Actor,
    input: ImportAbstractInput,
  ) {
    if (!isChair(actor, input.editionId)) throw new ForbiddenError();

    const title = sanitizeTitle(input.title ?? "");
    if (isEmptyRichText(title)) {
      throw new ValidationError("The abstract title is empty.");
    }
    const body = sanitizeBody(input.body ?? "");
    if (isEmptyRichText(body)) {
      throw new ValidationError("The abstract body is empty.");
    }
    if (!ABSTRACT_LEVELS.includes(input.level)) {
      throw new ValidationError(`Unknown level: ${input.level}`);
    }
    if (!ABSTRACT_FORMATS.includes(input.format)) {
      throw new ValidationError(`Unknown format: ${input.format}`);
    }

    const [created] = await db
      .insert(schema.abstract)
      .values({
        editionId: input.editionId,
        submitterId: input.submitterId,
        categoryId: input.categoryId ?? null,
        title,
        level: input.level,
        format: input.format,
        bodyText: body,
        status: "accepted",
        submittedAt: new Date(),
      })
      .returning();
    return created;
  }

  // Delete a seeded meeting and everything under it by slug (edition cascades to
  // categories, abstracts, authors, affiliations, program, and so on). Admin
  // only. Used to make a re-run reversible.
  async function clearMeetingBySlug(actor: Actor, slug: string) {
    if (!isAdmin(actor)) throw new ForbiddenError();
    const ed = await db.query.edition.findFirst({
      where: eq(schema.edition.slug, slug),
    });
    if (!ed) return { deleted: false, editionId: null };
    await db.delete(schema.edition).where(eq(schema.edition.id, ed.id));
    return { deleted: true, editionId: ed.id };
  }

  return {
    ensureSystemUser,
    createArchivedEdition,
    createAcceptedAbstract,
    clearMeetingBySlug,
  };
}

// Build the importer from the environment, parallel to getDataAccess. Server
// only; the offline import script is the only caller.
export function getMeetingImporter(env: Env) {
  return createMeetingImporter(getDb(env));
}
