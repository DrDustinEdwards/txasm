import { desc, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { DB } from "./core";

// Site pages (schema.ts, page). The public routes read a page's published
// title, description and html. Carrel writes them through the site API, a
// machine caller with no acting user, so its writes are their own path here
// (hard rule 4's pattern): reached only from app/lib/carrel, each write and its
// page_revision row go in one batch, and the revision names Carrel's change id.

export type Page = typeof schema.page.$inferSelect;
export type PageRevision = typeof schema.pageRevision.$inferSelect;
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
  fields: Pick<Page, "source"> &
    Partial<Pick<Page, "title" | "description" | "searchFields" | "html" | "renderVersion" | "publishedAt">>;
}

export function createCarrelPages(db: DB) {
  return {
    list: (): Promise<Page[]> =>
      db.select().from(schema.page).orderBy(desc(schema.page.updatedAt), schema.page.slug),

    get: async (slug: string): Promise<Page | null> =>
      (await db.query.page.findFirst({ where: eq(schema.page.slug, slug) })) ?? null,

    revisions: (slug: string): Promise<PageRevision[]> =>
      db
        .select()
        .from(schema.pageRevision)
        .where(eq(schema.pageRevision.pageSlug, slug))
        .orderBy(desc(schema.pageRevision.createdAt), desc(schema.pageRevision.id))
        .limit(50),

    /** The update and its audit row, together or not at all. */
    async write(slug: string, w: PageWrite): Promise<void> {
      await db.batch([
        db.update(schema.page).set(w.fields).where(eq(schema.page.slug, slug)),
        db.insert(schema.pageRevision).values({
          pageSlug: slug,
          event: w.event,
          changeId: w.changeId,
          version: w.version,
          source: w.fields.source,
        }),
      ]);
    },
  };
}
