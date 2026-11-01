// /sitemap.xml: the public pages, every public meeting's program and abstract listing, each award,
// and each newsletter and archive document, each with the date it last changed where the data holds one
// (da.sitemap.lastModified); an index page takes the newest of what it lists. Abstract pages are reached from their listings.
import { sitemapDocument } from "@drdustinedwards/site-helpers/sitemap";
import { getDataAccess } from "~/lib/data-access";
import { CATEGORY_PATHS } from "~/lib/document-nav";
import { SITE_ORIGIN } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import type { Route } from "./+types/sitemap";

const STATIC_PATHS = [
  "/",
  "/meetings",
  "/awardees",
  "/award-nominations",
  "/branch-officers",
  "/newsletters",
  "/archive/abstract-books",
  "/archive/programs",
  "/trail",
  "/sponsorship",
  "/contact",
];

const newest = (dates: Array<Date | null | undefined>) =>
  dates.reduce<Date | undefined>((a, b) => (b && (!a || b > a) ? b : a), undefined);

export async function loader({ context }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const [noindex, meetings, awards, changed, ...documents] = await Promise.all([
    da.pages.noindexPaths(),
    da.editions.listPublic(),
    da.awards.listAll(),
    da.sitemap.lastModified(),
    ...(["newsletter", "abstract_book", "program"] as const).map(async (category) => {
      const basePath = CATEGORY_PATHS[category]?.basePath;
      const docs = (await da.documents.listByCategory(category)).map((d) => ({ path: `${basePath}/${d.slug}`, lastmod: d.updatedAt }));
      return { basePath, docs };
    }),
  ]);
  const listed: Record<string, Date | undefined> = {
    "/meetings": newest([...changed.edition.values()]),
    "/awardees": newest([...changed.award.values()]),
    "/branch-officers": changed.officers,
    ...Object.fromEntries(documents.map((c) => [c.basePath, newest(c.docs.map((d) => d.lastmod))])),
  };
  const pages = [
    ...STATIC_PATHS.filter((path) => !noindex.has(path)).map((path) => ({ path, lastmod: changed.page.get(path) ?? listed[path] })),
    ...meetings.flatMap((m) => {
      const lastmod = changed.edition.get(m.slug);
      return [
        { path: `/meetings/${m.slug}/program`, lastmod },
        ...(m.abstractCount > 0 ? [{ path: `/meetings/${m.slug}/abstracts`, lastmod }] : []),
      ];
    }),
    ...awards.map((a) => ({ path: `/awards/${a.slug}`, lastmod: changed.award.get(a.id) })),
    ...documents.flatMap((c) => c.docs),
  ];
  return new Response(sitemapDocument(pages.map(({ path, lastmod }) => ({ loc: `${SITE_ORIGIN}${path}`, lastmod }))), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
