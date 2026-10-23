import { and, desc, eq, inArray, ne } from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  countWords,
  isEmptyRichText,
  sanitizeBody,
  sanitizeTitle,
} from "../richtext";
import {
  ABSTRACT_FORMATS,
  ABSTRACT_LEVELS,
  type AbstractFormat,
  type AbstractLevel,
  DEFAULT_WORD_LIMIT,
} from "../vocab";
import {
  type Actor,
  byIdChunks,
  chunk,
  type DB,
  DeadlinePassedError,
  ForbiddenError,
  insertChunkSize,
  isChair,
  isReviewer,
  NotFoundError,
  ValidationError,
} from "./core";

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

// Shared guard: the abstract exists and the actor may edit it now. A chair of
// the meeting may edit any time; the submitter may edit only before the
// submission deadline. Returns the row.
async function requireEditableAbstract(db: DB, actor: Actor, abstractId: string) {
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

export function createAbstracts(db: DB) {
  return {
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
      await requireEditableAbstract(db, actor, abstractId);

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
      await requireEditableAbstract(db, actor, abstractId);
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
      await requireEditableAbstract(db, actor, abstractId);
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
      const wordLimit = ed?.abstractWordLimit ?? DEFAULT_WORD_LIMIT;
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
      const { rows, ids, namesByAbstract } = await submittedAbstracts(db, editionId);
      if (rows.length === 0) return [];

      const assignments = await byIdChunks(ids, (part) =>
        db
          .select({ abstractId: schema.reviewAssignment.abstractId })
          .from(schema.reviewAssignment)
          .where(inArray(schema.reviewAssignment.abstractId, part)),
      );
      const submittedReviews = await byIdChunks(ids, (part) =>
        db
          .select({ abstractId: schema.review.abstractId })
          .from(schema.review)
          .where(and(inArray(schema.review.abstractId, part), eq(schema.review.status, "submitted"))),
      );

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
}

// Every abstract of a meeting that is no longer a draft, newest submission
// first, with its author names in order: the rows the chair's dashboard and the
// decisions page both start from. Does not gate; callers check isChair.
export async function submittedAbstracts(db: DB, editionId: string) {
  const rows = await db
    .select()
    .from(schema.abstract)
    .where(and(eq(schema.abstract.editionId, editionId), ne(schema.abstract.status, "draft")))
    .orderBy(desc(schema.abstract.submittedAt), desc(schema.abstract.createdAt));
  const ids = rows.map((r) => r.id);
  const authors = await byIdChunks(ids, (part) =>
    db
      .select({ abstractId: schema.author.abstractId, firstName: schema.author.firstName, lastName: schema.author.lastName })
      .from(schema.author)
      .where(inArray(schema.author.abstractId, part))
      .orderBy(schema.author.ordinal),
  );
  const namesByAbstract = new Map<string, string[]>();
  for (const a of authors) {
    const name = `${a.firstName} ${a.lastName}`.trim();
    const list = namesByAbstract.get(a.abstractId) ?? [];
    if (name) list.push(name);
    namesByAbstract.set(a.abstractId, list);
  }
  return { rows, ids, namesByAbstract };
}
