// /sitemap.xml: the public pages, every public meeting's program and abstract listing, each award,
// and each newsletter and archive document. Abstract pages are reached from their listings.
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

export async function loader({ context }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const [meetings, awards, ...documents] = await Promise.all([
    da.editions.listPublic(),
    da.awards.listAll(),
    ...(["newsletter", "abstract_book", "program"] as const).map(async (category) =>
      (await da.documents.listByCategory(category)).map(
        (d) => `${CATEGORY_PATHS[category]?.basePath}/${d.slug}`,
      ),
    ),
  ]);
  const paths = [
    ...STATIC_PATHS,
    ...meetings.flatMap((m) => [
      `/meetings/${m.slug}/program`,
      ...(m.abstractCount > 0 ? [`/meetings/${m.slug}/abstracts`] : []),
    ]),
    ...awards.map((a) => `/awards/${a.slug}`),
    ...documents.flat(),
  ];
  return new Response(sitemapDocument(paths.map((path) => ({ loc: `${SITE_ORIGIN}${path}` }))), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
