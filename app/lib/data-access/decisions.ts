import { and, eq } from "drizzle-orm";
import { inList } from "@dustinedwards/site-runtime/d1";
import * as schema from "../../db/schema";
import { isEmptyRichText } from "capsomer/behavior/rich-text-field";
import { sanitizeBody } from "../richtext";
import {
  DECISION_OUTCOMES,
  type AbstractStatus,
  type DecisionOutcome,
  type PresentationType,
} from "../vocab";
import { submittedAbstracts } from "./abstracts";
import {
  type Actor,
  type DB,
  ForbiddenError,
  isChair,
  NotFoundError,
  ValidationError,
} from "./core";

export interface DecisionInput {
  abstractId: string;
  outcome: DecisionOutcome;
  presentationType?: PresentationType | null;
  decisionMessage?: string;
}

// Decisions: the chair reads the reviews and records accept/reject/revise per
// abstract. One decision per abstract. Email is deferred, so the decision is
// shown to the author in-app; notifyState stays none until mail is built.
// The status an abstract returns to when it has no accept or reject: under_review while reviewers are
// assigned, otherwise submitted. An abstract already in one of those stays there.
async function statusWithoutDecision(db: DB, abs: { id: string; status: AbstractStatus }) {
  if (abs.status === "submitted" || abs.status === "under_review") return abs.status;
  const assigned = await db.query.reviewAssignment.findFirst({
    columns: { id: true },
    where: eq(schema.reviewAssignment.abstractId, abs.id),
  });
  return assigned ? ("under_review" as const) : ("submitted" as const);
}

export function createDecisions(db: DB) {
  return {
    // Chair/admin of the meeting records or updates the decision for one
    // abstract. presentationType is required on accept and dropped otherwise.
    // The message is sanitized with the body allowlist. Side effect on the
    // abstract status: accept -> accepted, reject -> rejected, revise -> back to
    // under_review or submitted. A draft or withdrawn abstract has no decision.
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
        if (input.presentationType !== "oral" && input.presentationType !== "poster") {
          throw new ValidationError("Choose oral or poster for an accepted abstract.");
        }
        presentationType = input.presentationType;
      }

      const sanitized = input.decisionMessage ? sanitizeBody(input.decisionMessage) : null;
      const message = sanitized && !isEmptyRichText(sanitized) ? sanitized : null;

      if (abs.status === "draft" || abs.status === "withdrawn") {
        throw new ValidationError("Only a submitted abstract can be decided.");
      }

      const fields = {
        outcome: input.outcome,
        presentationType,
        decisionMessage: message,
        decidedById: actor.userId,
        decidedAt: new Date(),
      };
      const decisionWrite = db
        .insert(schema.decision)
        .values({ editionId: abs.editionId, abstractId: input.abstractId, ...fields })
        .onConflictDoUpdate({ target: schema.decision.abstractId, set: fields });

      // The decision and the abstract's status are one batch (a D1 transaction).
      const status =
        input.outcome === "accept"
          ? "accepted"
          : input.outcome === "reject"
            ? "rejected"
            : await statusWithoutDecision(db, abs);
      await db.batch([
        decisionWrite,
        db.update(schema.abstract).set({ status }).where(eq(schema.abstract.id, input.abstractId)),
      ]);

      return this.getForAbstract(actor, input.abstractId);
    },

    async listForEdition(actor: Actor, editionId: string) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const { rows, ids, namesByAbstract } = await submittedAbstracts(db, editionId);
      if (rows.length === 0) return [];

      const submittedReviews = await db
        .select({
          abstractId: schema.review.abstractId,
          recommendation: schema.review.recommendation,
        })
        .from(schema.review)
        .where(and(inList(schema.review.abstractId, ids), eq(schema.review.status, "submitted")));
      const decisionRows = await db
        .select()
        .from(schema.decision)
        .where(inList(schema.decision.abstractId, ids));

      const emptySummary = () => ({ accept: 0, reject: 0, revise: 0, total: 0 });
      const summaryByAbstract = new Map<string, ReturnType<typeof emptySummary>>();
      for (const r of submittedReviews) {
        const s = summaryByAbstract.get(r.abstractId) ?? emptySummary();
        s.total += 1;
        if (r.recommendation === "accept") s.accept += 1;
        else if (r.recommendation === "reject") s.reject += 1;
        else if (r.recommendation === "revise") s.revise += 1;
        summaryByAbstract.set(r.abstractId, s);
      }

      const decisionByAbstract = new Map(decisionRows.map((d) => [d.abstractId, d]));

      return rows.map((r) => {
        const decisionRow = decisionByAbstract.get(r.id);
        const summary = summaryByAbstract.get(r.id) ?? emptySummary();
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

    // The decisions on the actor's own abstracts, by abstract id, in one query: the author's list page reads
    // these instead of one getForAbstract per row. Ownership is the join, so no other author's decision can
    // come back; the fields are getForAbstract's.
    async listForMine(actor: Actor) {
      const rows = await db
        .select({
          abstractId: schema.decision.abstractId,
          outcome: schema.decision.outcome,
          presentationType: schema.decision.presentationType,
          decisionMessage: schema.decision.decisionMessage,
          decidedAt: schema.decision.decidedAt,
          notifyState: schema.decision.notifyState,
          notifiedAt: schema.decision.notifiedAt,
        })
        .from(schema.decision)
        .innerJoin(schema.abstract, eq(schema.abstract.id, schema.decision.abstractId))
        .where(eq(schema.abstract.submitterId, actor.userId));
      return new Map(rows.map(({ abstractId, ...decision }) => [abstractId, decision]));
    },

    // Chair/admin removes a decision, for corrections. An accepted or rejected abstract goes back to
    // under_review when reviewers are assigned, otherwise to submitted; any other status stays.
    async clearDecision(actor: Actor, abstractId: string) {
      const abs = await db.query.abstract.findFirst({
        where: eq(schema.abstract.id, abstractId),
      });
      if (!abs) throw new NotFoundError();
      if (!isChair(actor, abs.editionId)) throw new ForbiddenError();

      const clear = db.delete(schema.decision).where(eq(schema.decision.abstractId, abstractId));
      if (abs.status === "accepted" || abs.status === "rejected") {
        await db.batch([
          clear,
          db
            .update(schema.abstract)
            .set({ status: await statusWithoutDecision(db, abs) })
            .where(eq(schema.abstract.id, abstractId)),
        ]);
      } else {
        await clear;
      }

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
        throw new ValidationError("Record a decision before notifying the author.");
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
