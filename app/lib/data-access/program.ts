import { desc, eq, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  type Actor,
  type DB,
  ForbiddenError,
  isChair,
  NotFoundError,
  ValidationError,
} from "./core";
import {
  groupSessionsIntoDays,
  PROGRAM_PUBLIC_STATUSES,
  type ProgramBookData,
  type ProgramSchedule,
  type ProgramSessionInput,
  type ProgramSessionPatch,
  type ProgramSessionResolved,
  type PublicProgram,
  resolveProgram,
} from "./program-model";
import { PLATFORM_SETTINGS_ID, resolveSettings } from "./settings";

// Program sessions. Chair/admin, except getPublicProgram which is public by
// design and returns data only for a meeting at a public stage.
export function createProgramSessions(db: DB) {
  return {
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
      return resolveProgram(db, editionId, sessions, items);
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
      const resolved = await resolveProgram(db, editionId, sessions, items);

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
      const resolved = await resolveProgram(db, editionId, sessions, items);
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
}

// Program document data. Assembles the front matter, the day-and-concurrency
// schedule (moderators and items resolved), the invited speakers, and the
// sponsors for the printable program. Chair/admin only. The return is plain
// data so renderProgramBook in ./program-book is a pure function of it.
export function createProgram(db: DB) {
  return {
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
      const resolved = await resolveProgram(db, editionId, sessions, items);

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
}
