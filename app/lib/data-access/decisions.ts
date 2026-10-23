import { and, desc, eq, inArray, ne } from "drizzle-orm";
import * as schema from "../../db/schema";
import { isEmptyRichText, sanitizeBody } from "../richtext";
import {
  DECISION_OUTCOMES,
  type DecisionOutcome,
  type PresentationType,
} from "../vocab";
import { submittedAbstracts } from "./abstracts";
import {
  type Actor,
  byIdChunks,
  type DB,
  ForbiddenError,
  isChair,
  NotFoundError,
  ValidationError,
} from "./core";

// ConflictReason, the review recommendations, DecisionOutcome, and
// PresentationType vocabularies live in ./vocab and are imported above.

export interface DecisionInput {
  abstractId: string;
  outcome: DecisionOutcome;
  presentationType?: PresentationType | null;
  decisionMessage?: string;
}

// Decisions: the chair reads the reviews and records accept/reject/revise per
// abstract. One decision per abstract. Email is deferred, so the decision is
// shown to the author in-app; notifyState stays none until mail is built.
export function createDecisions(db: DB) {
  return {
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
      const { rows, ids, namesByAbstract } = await submittedAbstracts(db, editionId);
      if (rows.length === 0) return [];

      const submittedReviews = await byIdChunks(ids, (part) =>
        db
          .select({ abstractId: schema.review.abstractId, recommendation: schema.review.recommendation })
          .from(schema.review)
          .where(and(inArray(schema.review.abstractId, part), eq(schema.review.status, "submitted"))),
      );
      const decisionRows = await byIdChunks(ids, (part) =>
        db.select().from(schema.decision).where(inArray(schema.decision.abstractId, part)),
      );

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
}
