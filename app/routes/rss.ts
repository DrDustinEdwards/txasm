// /rss.xml from Prelum's rssDocument: the newest newsletters, abstract books and programs, newest
// added first, each linking to its page. The public layout links it as the site's feed.
import { rssDocument } from "@drdustinedwards/site-helpers/feeds";
import { getDataAccess } from "~/lib/data-access";
import { CATEGORY_PATHS, documentSubtitle } from "~/lib/document-nav";
import { FEED_PATH, SITE_ORIGIN } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import type { Route } from "./+types/rss";

const FEED_CATEGORIES = ["newsletter", "abstract_book", "program"] as const;
const FEED_ITEMS = 20;

export async function loader({ context }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const [settings, rows] = await Promise.all([da.settings.get(), da.documents.listRecent(FEED_CATEGORIES, FEED_ITEMS)]);
  const posts = rows.map((doc) => {
    const section = CATEGORY_PATHS[doc.category];
    const subtitle = documentSubtitle(doc);
    return {
      // The full path, so one feed links each category's own page (itemPath is empty below).
      slug: `${section?.basePath.slice(1)}/${doc.slug}`,
      title: doc.title,
      html: null,
      description: [section?.title, subtitle].filter(Boolean).join(": ") || null,
      publishAt: doc.createdAt,
      tags: section ? [section.title] : [],
    };
  });
  const body = rssDocument({
    title: settings.orgName || "Texas Branch of the American Society for Microbiology",
    link: `${SITE_ORIGIN}/`,
    description: "New newsletters, abstract books and programs from the Texas Branch of the American Society for Microbiology.",
    selfUrl: `${SITE_ORIGIN}${FEED_PATH}`,
    posts,
    origin: SITE_ORIGIN,
    itemPath: "",
    lastBuildDate: rows[0]?.createdAt,
  });
  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
