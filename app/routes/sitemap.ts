// /sitemap.xml: the public pages, every public meeting's program and abstract listing, each award,
// every accepted abstract, each award, and each newsletter and archive document, each with the date it last changed
// where the data holds one (da.sitemap.lastModified); an index page takes the newest of what it lists, and a page no row
// dates takes the day its text last changed (page-dates.server.ts).
import { sitemapDocument } from "@drdustinedwards/site-helpers/sitemap";
import { pageRecordStore, TRACKED_PATHS } from "~/lib/page-dates.server";
import { getDataAccess } from "~/lib/data-access";
import { CATEGORY_PATHS } from "~/lib/document-nav";
import { SITE_ORIGIN } from "~/lib/site-meta";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import type { Route } from "./+types/sitemap";

const newest = (dates: Array<Date | null | undefined>) =>
  dates.reduce<Date | undefined>((a, b) => (b && (!a || b > a) ? b : a), undefined);

export async function loader({ context }: Route.LoaderArgs) {
  const env = context.get(cloudflareContext).env;
  const da = getDataAccess(env);
  const [noindex, meetings, awards, changed, tracked, ...documents] = await Promise.all([
    da.pages.noindexPaths(),
    da.editions.listPublic(),
    da.awards.listAll(),
    da.sitemap.lastModified(),
    pageRecordStore(env).load(),
    ...(["newsletter", "abstract_book", "program"] as const).map(async (category) => {
      const basePath = CATEGORY_PATHS[category]?.basePath;
      const docs = (await da.documents.listByCategory(category)).map((d) => ({
        path: `${basePath}/${d.slug}`,
        lastmod: d.updatedAt,
      }));
      return { basePath, docs };
    }),
  ]);
  const abstractPages = await Promise.all(
    meetings.map(
      async ({ slug }) =>
        (await da.publicAbstracts.listForEdition(slug))?.abstracts.map((a) => ({
          path: `/meetings/${slug}/abstracts/${a.number}`,
          lastmod: changed.edition.get(slug),
        })) ?? [],
    ),
  );
  const listed: Record<string, Date | undefined> = {
    "/meetings": newest([...changed.edition.values()]),
    "/awardees": newest([...changed.award.values()]),
    "/branch-officers": changed.officers,
    ...Object.fromEntries(documents.map((c) => [c.basePath, newest(c.docs.map((d) => d.lastmod))])),
  };
  const pages = [
    ...TRACKED_PATHS.filter((path) => !noindex.has(path)).map((path) => ({
      path,
      lastmod:
        changed.page.get(path) ??
        listed[path] ??
        (tracked?.[path] ? new Date(tracked[path].lastmod) : undefined),
    })),
    ...meetings.flatMap((m) => {
      const lastmod = changed.edition.get(m.slug);
      return [
        { path: `/meetings/${m.slug}/program`, lastmod },
        ...(m.abstractCount > 0 ? [{ path: `/meetings/${m.slug}/abstracts`, lastmod }] : []),
      ];
    }),
    ...abstractPages.flat(),
    ...awards.map((a) => ({ path: `/awards/${a.slug}`, lastmod: changed.award.get(a.id) })),
    ...documents.flatMap((c) => c.docs),
  ];
  return new Response(
    sitemapDocument(pages.map(({ path, lastmod }) => ({ loc: `${SITE_ORIGIN}${path}`, lastmod }))),
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
