import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { isEmptyRichText, sanitizeBody } from "../richtext";
import {
  CONFLICT_REASONS,
  type ConflictReason,
  REVIEW_RECOMMENDATIONS,
} from "../vocab";
import {
  type Actor,
  ConflictOfInterestError,
  type DB,
  DeadlinePassedError,
  ForbiddenError,
  isAdmin,
  isChair,
  isReviewer,
  NotFoundError,
  ValidationError,
} from "./core";

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

export function createReviews(db: DB) {
  return {
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
}

// Roles: admins grant and revoke chair and reviewer per meeting. admin itself
// is not grantable here; it is the ADMIN_EMAILS list (getActor). Accounts are created
// on first sign-in, so a grant needs the person to have signed in once.
export function createRoles(db: DB) {
  return {
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
}
