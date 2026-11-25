import { and, desc, eq, ne } from "drizzle-orm";
import { inList, chunked, rowsPerInsert } from "@dustinedwards/site-runtime/d1";
import * as schema from "../../db/schema";
import { isEmptyRichText, richTextWords } from "capsomer/behavior/rich-text-field";
import { sanitizeBody, sanitizeTitle } from "../richtext";
import {
  ABSTRACT_FORMATS,
  ABSTRACT_LEVELS,
  type AbstractFormat,
  type AbstractLevel,
  DEFAULT_WORD_LIMIT,
  EDITION_STATUSES,
} from "../vocab";
import { cleanAffiliations, cleanAuthors } from "./abstract-input";
import {
  type Actor,
  type DB,
  DeadlinePassedError,
  ForbiddenError,
  isChair,
  isReviewer,
  NotFoundError,
  ValidationError,
} from "./core";

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

// Whether authors may start and edit abstracts for a meeting: only at the "submission open" stage, inside the
// opens-at and deadline times when they are set. Earlier stages are not open yet; later ones, and archived
// meetings, are closed.
export function submissionWindow(
  ed: Pick<
    typeof schema.edition.$inferSelect,
    "status" | "submissionOpensAt" | "submissionDeadline"
  >,
  now = Date.now(),
): "notYet" | "open" | "closed" {
  const stage = EDITION_STATUSES.indexOf(ed.status) - EDITION_STATUSES.indexOf("submission_open");
  if (stage < 0) return "notYet";
  if (stage > 0) return "closed";
  if (ed.submissionOpensAt && now < ed.submissionOpensAt.getTime()) return "notYet";
  if (ed.submissionDeadline && now > ed.submissionDeadline.getTime()) return "closed";
  return "open";
}

function assertSubmissionOpen(ed: Parameters<typeof submissionWindow>[0]) {
  const window = submissionWindow(ed);
  if (window === "notYet")
    throw new ValidationError("Submission is not open yet for this meeting.");
  if (window === "closed") throw new DeadlinePassedError("The submission deadline has passed.");
}

async function assertBeforeDeadline(db: DB, editionId: string) {
  const ed = await db.query.edition.findFirst({
    where: eq(schema.edition.id, editionId),
  });
  if (!ed) throw new NotFoundError("meeting not found");
  assertSubmissionOpen(ed);
  return ed;
}

async function wordLimitFor(db: DB, edition: { abstractWordLimit: number | null }) {
  if (edition.abstractWordLimit) return edition.abstractWordLimit;
  const settings = await db.query.platformSettings.findFirst({
    columns: { defaultAbstractWordLimit: true },
  });
  return settings?.defaultAbstractWordLimit ?? DEFAULT_WORD_LIMIT;
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
  await assertBeforeDeadline(db, row.editionId);
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

    async getForEdit(actor: Actor, abstractId: string) {
      const abstract = await this.get(actor, abstractId);
      // The form carries author emails, so an assigned reviewer, who reads blind, is not let in.
      if (!isChair(actor, abstract.editionId) && abstract.submitterId !== actor.userId) {
        throw new ForbiddenError();
      }
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
            inList(
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
        wordLimit: await wordLimitFor(db, edition),
        authors: authors.map((a) => ({
          ...a,
          affiliationOrdinals: (ordinalsByAuthor.get(a.id) ?? []).sort((x, y) => x - y),
        })),
        affiliations,
      };
    },

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

    // Start a new draft owned by the actor. The meeting's submission must be open (submissionWindow).
    async create(actor: Actor, input: { editionId: string; title: string }) {
      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.id, input.editionId),
      });
      if (!ed) throw new NotFoundError("meeting not found");
      assertSubmissionOpen(ed);
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
      const row = await requireEditableAbstract(db, actor, abstractId);

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
        // A topic of another meeting would drop the abstract from the listing, program and book.
        const category = patch.categoryId
          ? await db.query.abstractCategory.findFirst({
              where: and(
                eq(schema.abstractCategory.id, patch.categoryId),
                eq(schema.abstractCategory.editionId, row.editionId),
              ),
            })
          : null;
        set.categoryId = category?.id ?? null;
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
        await db.update(schema.abstract).set(set).where(eq(schema.abstract.id, abstractId));
      }
      return this.get(actor, abstractId);
    },

    // Replace the abstract's affiliations, authors and their links as one set,
    // ordinals by position (an author's affiliationOrdinals name affiliations by
    // position). Every field is checked before anything is written, then the
    // deletes and inserts go to D1 in one batch, which D1 runs as a transaction:
    // a failed statement rolls the whole batch back
    // (https://developers.cloudflare.com/d1/worker-api/d1-database/#batch,
    // https://orm.drizzle.team/docs/batch-api). A bad save leaves the old lists.
    async setContributors(
      actor: Actor,
      abstractId: string,
      input: { affiliations: AffiliationInput[]; authors: AuthorInput[] },
    ) {
      await requireEditableAbstract(db, actor, abstractId);
      const affiliations = cleanAffiliations(input.affiliations).map((a, i) => ({
        ...a,
        id: crypto.randomUUID(),
        abstractId,
        ordinal: i + 1,
      }));
      const cleaned = cleanAuthors(input.authors);
      // An author who has an account is linked to it, so the conflict-of-interest
      // check and account erase find them by id, not only by email.
      const emails = [...new Set(cleaned.flatMap((a) => (a.email ? [a.email.toLowerCase()] : [])))];
      const accounts = emails.length
        ? await db
            .select({ id: schema.user.id, email: schema.user.email })
            .from(schema.user)
            .where(inList(schema.user.email, emails))
        : [];
      const userByEmail = new Map(accounts.map((u) => [u.email.toLowerCase(), u.id]));
      const authors = cleaned.map((a, i) => ({
        id: crypto.randomUUID(),
        userId: a.email ? (userByEmail.get(a.email.toLowerCase()) ?? null) : null,
        abstractId,
        ordinal: i + 1,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        isPresenting: a.isPresenting,
        isCorresponding: a.isCorresponding,
      }));
      // An ordinal past the list is dropped, and a repeated one linked once (the
      // link's primary key would refuse it, and with it the whole save).
      const links = cleaned.flatMap((a, i) =>
        [...new Set(a.affiliationOrdinals)]
          .filter((ord) => ord >= 1 && ord <= affiliations.length)
          .map((ord) => ({ authorId: authors[i].id, affiliationId: affiliations[ord - 1].id })),
      );

      // Each insert stays under D1's bound-parameter cap: affiliation binds 7
      // columns per row, author 10 (with user_id and created_at), a link 2.
      await db.batch([
        db.delete(schema.author).where(eq(schema.author.abstractId, abstractId)),
        db.delete(schema.affiliation).where(eq(schema.affiliation.abstractId, abstractId)),
        ...chunked(affiliations, rowsPerInsert(7)).map((part) =>
          db.insert(schema.affiliation).values(part),
        ),
        ...chunked(authors, rowsPerInsert(10)).map((part) => db.insert(schema.author).values(part)),
        ...chunked(links, rowsPerInsert(2)).map((part) =>
          db.insert(schema.authorAffiliation).values(part),
        ),
      ]);
      return { affiliations: affiliations.length, authors: authors.length, links: links.length };
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
      // A decided or withdrawn abstract stays as it is. A draft, or one sent back for revision, is submitted again.
      if (row.status === "accepted" || row.status === "rejected" || row.status === "withdrawn") {
        throw new ValidationError("This abstract can no longer be submitted.");
      }

      const ed = await assertBeforeDeadline(db, row.editionId);

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
      const wordLimit = await wordLimitFor(db, ed ?? { abstractWordLimit: null });
      if (richTextWords(row.bodyText) > wordLimit) {
        throw new ValidationError(`The abstract body is over the ${wordLimit} word limit.`);
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

    async listForEdition(actor: Actor, editionId: string) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const { rows, ids, namesByAbstract } = await submittedAbstracts(db, editionId);
      if (rows.length === 0) return [];

      const assignments = await db
        .select({ abstractId: schema.reviewAssignment.abstractId })
        .from(schema.reviewAssignment)
        .where(inList(schema.reviewAssignment.abstractId, ids));
      const submittedReviews = await db
        .select({ abstractId: schema.review.abstractId })
        .from(schema.review)
        .where(and(inList(schema.review.abstractId, ids), eq(schema.review.status, "submitted")));

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
  const authors = await db
    .select({
      abstractId: schema.author.abstractId,
      firstName: schema.author.firstName,
      lastName: schema.author.lastName,
    })
    .from(schema.author)
    .where(inList(schema.author.abstractId, ids))
    .orderBy(schema.author.ordinal);
  const namesByAbstract = new Map<string, string[]>();
  for (const a of authors) {
    const name = `${a.firstName} ${a.lastName}`.trim();
    const list = namesByAbstract.get(a.abstractId) ?? [];
    if (name) list.push(name);
    namesByAbstract.set(a.abstractId, list);
  }
  return { rows, ids, namesByAbstract };
}
