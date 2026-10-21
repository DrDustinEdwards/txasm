import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { isEmptyRichText, sanitizeBody, sanitizeTitle } from "../richtext";
import {
  ABSTRACT_FORMATS,
  ABSTRACT_LEVELS,
  type AbstractFormat,
  type AbstractLevel,
  EDITION_STATUSES,
  type EditionStatus,
  type Season,
  SEASONS,
} from "../vocab";
import {
  type Actor,
  AlreadyExistsError,
  type DB,
  ForbiddenError,
  isAdmin,
  isChair,
  ValidationError,
} from "./core";

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
const SYSTEM_IMPORT_USER_ID = "system-import";

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
  body: string; // raw em/sup/sub markup, sanitized here; may be empty (body-less talk)
  level: AbstractLevel | null; // null for oral presentations grouped by topic
  format: AbstractFormat;
  // The topic category, or null for abstracts the source does not categorize by
  // topic (in the archive, oral presentations are grouped by level, not topic).
  // The abstract.category_id column is nullable, so this needs no schema change.
  categoryId: string | null;
  // The printed book code lifted from the source (for example UGM 1, GSP 3). When
  // present it is stored with code_source "printed"; when absent the abstract keeps
  // a null code. Kept faithful to the book, never generated here.
  code?: string | null;
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
    // The body may be legitimately empty for a body-less invited talk in the
    // archive; keep it faithful and store null rather than rejecting it.
    const body = sanitizeBody(input.body ?? "");
    const bodyText = isEmptyRichText(body) ? null : body;
    // Oral presentations are grouped by topic and carry no level, so null is
    // valid; a non-null level must be a known one.
    if (input.level !== null && !ABSTRACT_LEVELS.includes(input.level)) {
      throw new ValidationError(`Unknown level: ${input.level}`);
    }
    if (!ABSTRACT_FORMATS.includes(input.format)) {
      throw new ValidationError(`Unknown format: ${input.format}`);
    }

    // A printed book code is stored verbatim with source "printed"; no code means
    // no code (never generated on this path).
    const code = input.code?.trim() || null;
    const codeSource = code ? "printed" : null;

    const [created] = await db
      .insert(schema.abstract)
      .values({
        editionId: input.editionId,
        submitterId: input.submitterId,
        categoryId: input.categoryId ?? null,
        title,
        level: input.level,
        format: input.format,
        code,
        codeSource,
        bodyText,
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
