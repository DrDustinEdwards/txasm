import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { d1ScheduledUpdates } from "@dustinedwards/site-api/schedules";
import type { ScheduledUpdate } from "@dustinedwards/site-api";
import * as schema from "../../db/schema";
import type { DB } from "./core";

// Site pages (schema.ts, page). The public routes read a page's published
// title, description and html. Carrel writes them through the site API, a
// machine caller with no acting user, so its writes are their own path here
// (hard rule 4's pattern): reached only from app/lib/carrel, each write and its
// page_revision row go in one batch, and the revision names Carrel's change id.
// An update Carrel schedules on a page is site-api's scheduled_updates row
// (d1ScheduledUpdates), stored, applied or dropped in that same batch.

export type Page = typeof schema.page.$inferSelect;
export type PageRevision = typeof schema.pageRevision.$inferSelect;
/** A revision as the list shows it: everything but the source, which revisionSource reads one at a time. */
export type PageRevisionSummary = Omit<PageRevision, "source">;
export type PageSearch = schema.PageSearch;

export interface PublishedPage {
  title: string;
  description: string | null;
  searchFields: PageSearch | null;
  html: string;
}

export function createPages(db: DB) {
  return {
    async published(slug: string): Promise<PublishedPage | null> {
      const row = await db.query.page.findFirst({
        where: eq(schema.page.slug, slug),
        columns: { title: true, description: true, searchFields: true, html: true, publishedAt: true },
      });
      return row?.publishedAt ? row : null;
    },

    /** The paths of the published pages marked noindex (home is "/"), which the sitemap and llms.txt leave out. */
    async noindexPaths(): Promise<Set<string>> {
      const rows = await db
        .select({ slug: schema.page.slug, searchFields: schema.page.searchFields, publishedAt: schema.page.publishedAt })
        .from(schema.page);
      return new Set(rows.filter((r) => r.publishedAt && r.searchFields?.noindex).map((r) => (r.slug === "home" ? "/" : `/${r.slug}`)));
    },
  };
}

export interface PageWrite {
  event: PageRevision["event"];
  changeId: string;
  version: string;
  /** The page's working source after the write, which its revision keeps. */
  source: string;
  /** The page row's change; none for a write to its schedule alone. */
  fields?: Partial<Pick<Page, "source" | "title" | "description" | "searchFields" | "html" | "renderVersion" | "publishedAt">>;
  /** Stores an update to go live at publishAt, or drops the one waiting (only that one, when `drop` names it). */
  schedule?:
    | { put: { source: string; publishAt: string; changeId: string } }
    | { drop: true | Pick<ScheduledUpdate, "publishAt" | "changeId"> };
}

export function createCarrelPages(db: DB, d1: D1Database) {
  const updates = d1ScheduledUpdates(d1);
  // A Drizzle query as a D1 statement, so it runs in one batch with site-api's own.
  const statement = (query: { toSQL(): { sql: string; params: unknown[] } }) => {
    const { sql, params } = query.toSQL();
    return d1.prepare(sql).bind(...params);
  };
  return {
    list: (): Promise<Page[]> =>
      db.select().from(schema.page).orderBy(desc(schema.page.updatedAt), schema.page.slug),

    get: async (slug: string): Promise<Page | null> =>
      (await db.query.page.findFirst({ where: eq(schema.page.slug, slug) })) ?? null,

    /** Every revision, newest first. Nothing prunes page_revision: two pages, a few kilobytes a write. */
    revisions: (slug: string): Promise<PageRevisionSummary[]> => {
      const { source: _source, ...columns } = getTableColumns(schema.pageRevision);
      return db
        .select(columns)
        .from(schema.pageRevision)
        .where(eq(schema.pageRevision.pageSlug, slug))
        .orderBy(desc(schema.pageRevision.createdAt), desc(schema.pageRevision.id));
    },

    /** The source a revision kept, however old, or null when the page has no such version. */
    revisionSource: async (slug: string, version: string): Promise<string | null> =>
      (
        await db.query.pageRevision.findFirst({
          where: and(eq(schema.pageRevision.pageSlug, slug), eq(schema.pageRevision.version, version)),
          columns: { source: true },
          orderBy: desc(schema.pageRevision.id),
        })
      )?.source ?? null,

    /** The update waiting on a page, or null. */
    scheduled: (slug: string): Promise<ScheduledUpdate | null> => updates.get(slug),

    /** The updates due at `now`, oldest first, at most `limit`. */
    due: (now: Date, limit: number) => updates.due(now, limit),

    /** The update, its schedule change and its audit row, together or not at all. */
    async write(slug: string, w: PageWrite): Promise<void> {
      const { schedule } = w;
      await d1.batch([
        ...(w.fields ? [statement(db.update(schema.page).set(w.fields).where(eq(schema.page.slug, slug)))] : []),
        ...(schedule && "put" in schedule ? [updates.put(slug, schedule.put) as D1PreparedStatement] : []),
        ...(schedule && "drop" in schedule
          ? [updates.remove(slug, schedule.drop === true ? undefined : schedule.drop) as D1PreparedStatement]
          : []),
        statement(
          db.insert(schema.pageRevision).values({
            pageSlug: slug,
            event: w.event,
            changeId: w.changeId,
            version: w.version,
            source: w.source,
          }),
        ),
      ]);
    },
  };
}
