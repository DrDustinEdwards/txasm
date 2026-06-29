import { and, desc, eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getDb } from "../db/index.server";
import { EDITION_STATUSES, type EditionStatus, type Season } from "./editions";

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

    // Edit until deadline. Submitter may edit their own draft before the
    // edition submission deadline. A chair may edit at any time.
    async update(actor: Actor, abstractId: string, patch: Partial<AbstractInput>) {
      const row = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, abstractId),
      });
      if (!row) throw new NotFoundError();

      const chair = isChair(actor, row.editionId);
      if (!chair && row.submitterId !== actor.userId) throw new ForbiddenError();

      if (!chair) {
        const ed = await db.query.edition.findFirst({
          where: eq(schema.edition.id, row.editionId),
        });
        const deadline = ed?.submissionDeadline;
        if (deadline && Date.now() > deadline.getTime()) {
          throw new DeadlinePassedError();
        }
      }

      const { editionId: _ignore, ...safe } = patch; // editionId is not editable here
      await db
        .update(schema.abstract)
        .set(safe)
        .where(eq(schema.abstract.id, abstractId));
      return this.get(actor, abstractId);
    },

    // Signatures for review, implemented later.
    listForEdition(actor: Actor, editionId: string): Promise<unknown[]> {
      throw new Error("not implemented");
    },
    create(actor: Actor, input: AbstractInput): Promise<unknown> {
      // Will check edition window. Whether a paid registration is required to
      // submit is an open decision (Q1) and gets enforced here once locked.
      throw new Error("not implemented");
    },
    submit(actor: Actor, abstractId: string): Promise<unknown> {
      throw new Error("not implemented");
    },
    withdraw(actor: Actor, abstractId: string): Promise<unknown> {
      throw new Error("not implemented");
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
    // validated against each criterion's min/max before write.
    async submit(actor: Actor, input: ReviewSubmission) {
      const assignment = await db.query.reviewAssignment.findFirst({
        where: eq(schema.reviewAssignment.id, input.assignmentId),
      });
      if (!assignment) throw new NotFoundError();
      if (assignment.reviewerId !== actor.userId) throw new ForbiddenError();

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

      // Body: upsert review row, replace scores, mark assignment completed.
      // Left out here; this function already shows the ownership + validation guard.
      throw new Error("not implemented (guard shown)");
    },

    // Reviewer view: abstracts assigned to the acting reviewer in an edition.
    listAssigned(actor: Actor, editionId: string): Promise<unknown[]> {
      throw new Error("not implemented");
    },
    declareConflict(
      actor: Actor,
      input: { abstractId: string; reason: string; note?: string },
    ): Promise<unknown> {
      throw new Error("not implemented");
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
    get(slug: string): Promise<unknown> {
      throw new Error("not implemented");
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

  return { abstracts, reviews, registrations, editions, registrationCategories };
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
