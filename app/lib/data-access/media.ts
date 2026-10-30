import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { DB } from "./core";

// The media library's index (schema.ts, media, media_revision, media_change). Like the pages,
// it is written only by Carrel through the site API, a machine caller with no acting user, so
// this is its own path, reached only from app/lib/carrel. The objects themselves live in the
// UPLOADS bucket under media/; this layer touches the index only.

export type MediaRow = typeof schema.media.$inferSelect;
export type MediaRevisionRow = typeof schema.mediaRevision.$inferSelect;
export type MediaFields = Partial<Omit<MediaRow, "key" | "rev" | "uploadedAt" | "updatedAt">>;

/** A versioned write's outcome: the new rev, or why nothing changed (and the rev the row holds). */
export type MediaWrite = { ok: true; rev: number } | { ok: false; reason: "missing" | "stale"; rev: number | null };

export function createCarrelMedia(db: DB) {
  const media = schema.media;
  const revisions = schema.mediaRevision;

  return {
    /** Every row. The library is a branch site's page pictures, so a list filters and sorts it in the Worker. */
    all: (): Promise<MediaRow[]> => db.select().from(media),

    get: async (key: string): Promise<MediaRow | null> =>
      (await db.query.media.findFirst({ where: eq(media.key, key) })) ?? null,

    many: async (keys: string[]): Promise<MediaRow[]> =>
      keys.length === 0 ? [] : db.select().from(media).where(inArray(media.key, keys)),

    /** The file whose bytes, now or as first uploaded (before a shrink), have this hash. */
    async byHash(sha256: string): Promise<MediaRow | null> {
      const current = await db.query.media.findFirst({ where: eq(media.sha256, sha256), orderBy: asc(media.uploadedAt) });
      if (current) return current;
      const [first] = await db
        .select({ key: revisions.mediaKey })
        .from(revisions)
        .where(and(eq(revisions.sha256, sha256), inArray(revisions.reason, ["upload", "import"])))
        .limit(1);
      return first ? ((await db.query.media.findFirst({ where: eq(media.key, first.key) })) ?? null) : null;
    },

    insert: async (row: typeof schema.media.$inferInsert): Promise<void> => {
      await db.insert(media).values(row);
    },

    /**
     * Writes `fields` and bumps rev, only if the row is still at `expectedRev` (null: whatever it holds), in one
     * statement, so a stale writer is refused and never overwrites a newer write.
     */
    async writeAtRev(key: string, fields: MediaFields, expectedRev: number | null): Promise<MediaWrite> {
      const where = expectedRev === null ? eq(media.key, key) : and(eq(media.key, key), eq(media.rev, expectedRev));
      const [written] = await db
        .update(media)
        .set({ ...fields, rev: sql`${media.rev} + 1` })
        .where(where)
        .returning({ rev: media.rev });
      if (written) return { ok: true, rev: written.rev };
      const row = await db.query.media.findFirst({ where: eq(media.key, key), columns: { rev: true } });
      return { ok: false, reason: row ? "stale" : "missing", rev: row?.rev ?? null };
    },

    /** Index columns that follow the object (bytes, size, hash), after the caller claimed the version. */
    follow: async (key: string, fields: MediaFields): Promise<void> => {
      await db.update(media).set(fields).where(eq(media.key, key));
    },

    /** Removes the row and, by cascade, its revisions. */
    remove: async (key: string): Promise<boolean> =>
      (await db.delete(media).where(eq(media.key, key)).returning({ key: media.key })).length > 0,

    /** Newest first. */
    revisions: (key: string, limit = 100): Promise<MediaRevisionRow[]> =>
      db.select().from(revisions).where(eq(revisions.mediaKey, key)).orderBy(desc(revisions.id)).limit(limit),

    addRevision: async (row: typeof schema.mediaRevision.$inferInsert): Promise<number> => {
      const [made] = await db.insert(revisions).values(row).returning({ id: revisions.id });
      return made!.id;
    },

    /** Names the kept copy of a revision's bytes, once newer bytes replace them. */
    keepRevision: async (id: number, backupKey: string): Promise<void> => {
      await db.update(revisions).set({ backupKey }).where(eq(revisions.id, id));
    },

    /** The newest change's sequence number, 0 before any. */
    async changeCursor(): Promise<number> {
      const [row] = await db.select({ seq: sql<number | null>`max(${schema.mediaChange.seq})` }).from(schema.mediaChange);
      return Number(row?.seq ?? 0);
    },

    /**
     * The keys changed after `since` and up to `upTo`, each once at its latest change, oldest first: one more than
     * `limit`, so the caller can tell whether more wait.
     */
    changedSince(since: number, upTo: number, limit: number): Promise<Array<{ key: string; seq: number }>> {
      const change = schema.mediaChange;
      const latest = sql<number>`max(${change.seq})`;
      return db
        .select({ key: change.mediaKey, seq: latest })
        .from(change)
        .where(sql`${change.seq} > ${since} AND ${change.seq} <= ${upTo}`)
        .groupBy(change.mediaKey)
        .orderBy(asc(latest))
        .limit(limit + 1);
    },
  };
}
