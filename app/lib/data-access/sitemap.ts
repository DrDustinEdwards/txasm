import { eq, inArray, max } from "drizzle-orm";
import * as schema from "../../db/schema";
import { PROGRAM_PUBLIC_STATUSES } from "./program-model";
import type { DB } from "./core";

// When each public page last changed, for the sitemap's lastmod. A page's date is that of the newest row it shows, so
// a draft that is not live yet never moves it: a Carrel page's newest publish revision, an award's newest recipient,
// a meeting's newest program session or item or accepted abstract, the officers page's newest officer. A public read with no actor (metadata only).

const later = (a: Date | null | undefined, b: Date | null | undefined) => (!a ? (b ?? null) : !b || a > b ? a : b);

export function createSitemap(db: DB) {
  return {
    async lastModified() {
      const [pages, awards, recipients, editions, sessions, items, abstracts, officers] = await Promise.all([
        db
          .select({ slug: schema.pageRevision.pageSlug, at: max(schema.pageRevision.createdAt) })
          .from(schema.pageRevision)
          .where(eq(schema.pageRevision.event, "publish"))
          .groupBy(schema.pageRevision.pageSlug),
        db.select({ id: schema.award.id, at: schema.award.updatedAt }).from(schema.award),
        db
          .select({ id: schema.awardRecipient.awardId, at: max(schema.awardRecipient.updatedAt) })
          .from(schema.awardRecipient)
          .groupBy(schema.awardRecipient.awardId),
        db
          .select({ id: schema.edition.id, slug: schema.edition.slug, at: schema.edition.updatedAt })
          .from(schema.edition)
          .where(inArray(schema.edition.status, [...PROGRAM_PUBLIC_STATUSES])),
        db
          .select({ id: schema.programSession.editionId, at: max(schema.programSession.updatedAt) })
          .from(schema.programSession)
          .groupBy(schema.programSession.editionId),
        db
          .select({ id: schema.programSession.editionId, at: max(schema.programItem.updatedAt) })
          .from(schema.programItem)
          .innerJoin(schema.programSession, eq(schema.programItem.sessionId, schema.programSession.id))
          .groupBy(schema.programSession.editionId),
        db
          .select({ id: schema.abstract.editionId, at: max(schema.abstract.updatedAt) })
          .from(schema.abstract)
          .where(eq(schema.abstract.status, "accepted"))
          .groupBy(schema.abstract.editionId),
        db.select({ at: max(schema.branchOfficer.updatedAt) }).from(schema.branchOfficer),
      ]);
      const award = new Map(awards.map((a) => [a.id, a.at]));
      for (const r of recipients) if (award.has(r.id)) award.set(r.id, later(award.get(r.id), r.at) as Date);
      const edition = new Map<string, Date>(editions.map((e) => [e.id, e.at]));
      for (const row of [...sessions, ...items, ...abstracts]) {
        if (edition.has(row.id)) edition.set(row.id, later(edition.get(row.id), row.at) as Date);
      }
      return {
        /** by path: "/" for home, else "/<slug>" */
        page: new Map(pages.flatMap((p) => (p.at ? [[p.slug === "home" ? "/" : `/${p.slug}`, p.at] as const] : []))),
        /** the officers page's newest row */
        officers: officers[0]?.at ?? undefined,
        /** by award id */
        award,
        /** by meeting slug */
        edition: new Map(editions.map((e) => [e.slug, edition.get(e.id) as Date])),
      };
    },
  };
}
