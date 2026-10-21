import { and, desc, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { ProgramItemKind } from "../vocab";
import {
  type Actor,
  AlreadyExistsError,
  type DB,
  ForbiddenError,
  isChair,
  NotFoundError,
  ValidationError,
} from "./core";
import {
  acceptedAbstractsInBookOrder,
  assertKind,
  type ProgramAbstractOption,
  type ProgramItemPatch,
  publishedBookCodes,
} from "./program-model";

// Program items within a session. Chair/admin. An item is either an accepted
// abstract or a custom entry; that rule is enforced here.
export function createProgramItems(db: DB) {
  return {
    // Accepted abstracts in the meeting not yet placed in any session, for the
    // add-to-session picker, in book order.
    async listUnplacedAbstracts(
      actor: Actor,
      editionId: string,
    ): Promise<ProgramAbstractOption[]> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const ordered = await acceptedAbstractsInBookOrder(db, editionId);
      if (ordered.length === 0) return [];
      const codes = await publishedBookCodes(db, editionId);
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
      return ordered
        .filter((n) => !placedSet.has(n.abstractId))
        .map((n) => ({
          abstractId: n.abstractId,
          code: codes.get(n.abstractId) ?? null,
          title: n.title,
          presentingAuthorName: n.presentingAuthorName,
        }));
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
}
