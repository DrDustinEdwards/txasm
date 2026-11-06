import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { MediaLibraryStore, MediaRecord, MediaRecordFields, MediaRevisionRecord } from "@dustinedwards/site-api";
import * as schema from "../../db/schema";
import type { DB } from "./core";

// The media library's index (schema.ts, media, media_revision, media_change). Like the pages,
// it is written only by Carrel through the site API, a machine caller with no acting user, so
// this is its own path, reached only from app/lib/carrel. The objects themselves live in the
// UPLOADS bucket under media/; this layer touches the index only.
//
// `library` is site-api's MediaLibraryStore over these tables, for mediaLibrary
// (app/lib/carrel/media-adapter.server.ts): mapping only. Times are ms integers here and ISO 8601
// there; tags a JSON array; a revision's kept copy is backup_key (copyKey); updated_at is set by
// Drizzle on every insert and update. `many` is the rows as the page renders read them.

export type MediaRow = typeof schema.media.$inferSelect;
type MediaRevisionRow = typeof schema.mediaRevision.$inferSelect;

function storedTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function recordOf(row: MediaRow): MediaRecord {
  return {
    key: row.key,
    rev: row.rev,
    filename: row.filename,
    contentType: row.contentType,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    alt: row.alt,
    caption: row.caption,
    tags: storedTags(row.tags),
    focus: row.focus,
    credit: row.credit,
    license: row.license,
    sourceUrl: row.sourceUrl,
    licenseExpires: row.licenseExpires,
    takenAt: row.takenAt,
    placeholder: row.placeholder,
    color: row.color,
    uploadedAt: row.uploadedAt.toISOString(),
    trashedAt: row.trashedAt ? row.trashedAt.toISOString() : null,
  };
}

/** A record's fields as this table's columns; the fields the table has no column for are dropped. */
function columnsOf(fields: MediaRecordFields): Partial<typeof schema.media.$inferInsert> {
  const { tags, uploadedAt, trashedAt, sha256, decorative: _d, copyright: _c, licenseUrl: _l, acquireLicenseUrl: _a, ...rest } = fields;
  return {
    ...rest,
    ...(tags !== undefined ? { tags: JSON.stringify(tags) } : {}),
    ...(uploadedAt !== undefined ? { uploadedAt: new Date(uploadedAt) } : {}),
    ...(trashedAt !== undefined ? { trashedAt: trashedAt === null ? null : new Date(trashedAt) } : {}),
    // The column is NOT NULL; the library sets a hash on every write that names one.
    ...(sha256 ? { sha256 } : {}),
  };
}

function revisionOf(row: MediaRevisionRow): MediaRevisionRecord {
  return {
    id: row.id,
    at: row.at.toISOString(),
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    reason: row.reason,
    sha256: row.sha256,
    copyKey: row.backupKey,
  };
}

export function createCarrelMedia(db: DB) {
  const media = schema.media;
  const revisions = schema.mediaRevision;
  const one = async (key: string) => (await db.query.media.findFirst({ where: eq(media.key, key) })) ?? null;

  const library: MediaLibraryStore = {
    record: async (key) => {
      const row = await one(key);
      return row ? recordOf(row) : null;
    },

    records: async (keys) => (keys.length === 0 ? [] : (await db.select().from(media).where(inArray(media.key, keys))).map(recordOf)),

    all: async () => (await db.select().from(media).orderBy(desc(media.uploadedAt), asc(media.key))).map(recordOf),

    async byHash(sha256) {
      const current = await db.query.media.findFirst({ where: eq(media.sha256, sha256), orderBy: [asc(media.uploadedAt), asc(media.key)] });
      if (current) return recordOf(current);
      const [first] = await db
        .select({ key: revisions.mediaKey })
        .from(revisions)
        .where(and(eq(revisions.sha256, sha256), inArray(revisions.reason, ["upload", "import"])))
        .orderBy(asc(revisions.id))
        .limit(1);
      const row = first ? await one(first.key) : null;
      return row ? recordOf(row) : null;
    },

    async insert(record) {
      await db.insert(media).values({ ...columnsOf(record), key: record.key, contentType: record.contentType, bytes: record.bytes, sha256: record.sha256 ?? "", uploadedAt: new Date(record.uploadedAt) });
    },

    async writeAtRev(key, fields, expectedRev) {
      const [written] = await db
        .update(media)
        .set({ ...columnsOf(fields), rev: sql`${media.rev} + 1` })
        .where(and(eq(media.key, key), eq(media.rev, expectedRev)))
        .returning();
      if (written) return { ok: true, record: recordOf(written) };
      const row = await one(key);
      return row ? { ok: false, reason: "stale", rev: row.rev } : { ok: false, reason: "missing" };
    },

    async follow(key, fields) {
      const columns = columnsOf(fields);
      const [row] = Object.keys(columns).length > 0 ? await db.update(media).set(columns).where(eq(media.key, key)).returning() : [await one(key)];
      if (!row) throw new Error(`${key} changed its bytes, but its row is gone`);
      return recordOf(row);
    },

    async addRevision(key, revision) {
      const [made] = await db
        .insert(revisions)
        .values({
          mediaKey: key,
          at: new Date(revision.at),
          bytes: revision.bytes,
          width: revision.width,
          height: revision.height,
          reason: revision.reason,
          sha256: revision.sha256,
          backupKey: revision.copyKey,
        })
        .returning({ id: revisions.id });
      if (!made) throw new Error(`${key}'s revision was not recorded`);
      return made.id;
    },

    revisions: async (key, limit = 100) =>
      (await db.select().from(revisions).where(eq(revisions.mediaKey, key)).orderBy(desc(revisions.id)).limit(limit)).map(revisionOf),

    async keepCopy(revisionId, copyKey) {
      await db.update(revisions).set({ backupKey: copyKey }).where(eq(revisions.id, revisionId));
    },

    // Only at the rev the reference check saw. The revisions go by name as well as by the foreign key's cascade, in one
    // batch with the row, and only once the row is gone.
    async remove(key, rev) {
      const [deleted] = await db.batch([
        db.delete(media).where(and(eq(media.key, key), eq(media.rev, rev))).returning({ key: media.key }),
        db.delete(revisions).where(and(eq(revisions.mediaKey, key), sql`NOT EXISTS (SELECT 1 FROM ${media} WHERE ${media.key} = ${key})`)),
      ]);
      if (deleted.length > 0) return "removed";
      return (await one(key)) ? "stale" : "missing";
    },

    async changeCursor() {
      const [row] = await db.select({ seq: sql<number | null>`max(${schema.mediaChange.seq})` }).from(schema.mediaChange);
      return Number(row?.seq ?? 0);
    },

    changedSince(from, head, limit) {
      const change = schema.mediaChange;
      const latest = sql<number>`max(${change.seq})`;
      return db
        .select({ key: change.mediaKey, seq: latest })
        .from(change)
        .where(sql`${change.seq} > ${from} AND ${change.seq} <= ${head}`)
        .groupBy(change.mediaKey)
        .orderBy(asc(latest))
        .limit(limit + 1);
    },
  };

  return {
    library,
    many: async (keys: string[]): Promise<MediaRow[]> => (keys.length === 0 ? [] : db.select().from(media).where(inArray(media.key, keys))),
  };
}
