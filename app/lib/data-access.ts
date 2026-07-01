import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getDb } from "../db/index.server";
import { EDITION_STATUSES, type EditionStatus, type Season } from "./editions";
import { isEmptyRichText, sanitizeBody, sanitizeTitle } from "./richtext";

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

export interface AbstractInput {
  editionId: string;
  title: string;
  categoryId?: string;
  background?: string;
  methods?: string;
  results?: string;
  conclusions?: string;
  bodyText?: string;
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

export type ConflictReason = "author" | "coauthor" | "colleague" | "other";
const CONFLICT_REASONS: readonly ConflictReason[] = [
  "author",
  "coauthor",
  "colleague",
  "other",
];

const RECOMMENDATIONS: readonly ReviewSubmission["recommendation"][] = [
  "accept",
  "reject",
  "revise",
];

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

// Edition status constants and the Season/EditionStatus types live in
// ./editions so route components can import them without pulling this
// server-only module into the client bundle. Re-export the types here for
// callers that already reach the data-access layer for related types.
export type { EditionStatus, Season } from "./editions";

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

export type RegistrationCategoryKey = "member" | "student" | "nonmember";

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
  return value && value.length > 0 ? value : "usd";
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
        await db.insert(schema.affiliation).values(
          cleaned.map((a, i) => ({
            abstractId,
            ordinal: i + 1,
            institution: a.institution,
            department: a.department,
            city: a.city,
            country: a.country,
          })),
        );
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

      const inserted = await db
        .insert(schema.author)
        .values(
          cleaned.map((a, i) => ({
            abstractId,
            ordinal: i + 1,
            firstName: a.firstName,
            lastName: a.lastName,
            email: a.email,
            isPresenting: a.isPresenting,
            isCorresponding: a.isCorresponding,
          })),
        )
        .returning();

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
        await db.insert(schema.authorAffiliation).values(links);
      }
      return inserted.length;
    },

    // Move a draft to submitted. Only the submitter, only before the deadline,
    // and only with a title, at least one author, and content in a section.
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
      const sections = [
        row.background,
        row.methods,
        row.results,
        row.conclusions,
        row.bodyText,
      ];
      if (!sections.some((s) => s && !isEmptyRichText(s))) {
        throw new ValidationError(
          "Add abstract content in at least one section before submitting.",
        );
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

      if (!RECOMMENDATIONS.includes(input.recommendation)) {
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
      if (!["member", "student", "nonmember"].includes(input.key)) {
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

  return {
    abstracts,
    reviews,
    roles,
    registrations,
    editions,
    registrationCategories,
    abstractCategories,
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
