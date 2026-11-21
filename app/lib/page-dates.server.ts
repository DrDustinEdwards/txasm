import { kvPageRecord, trackPageDates } from "@drdustinedwards/site-helpers/lastmod";
import { htmlToMarkdown } from "@drdustinedwards/site-helpers/markdown-copy";
import { d1FireStore } from "@dustinedwards/site-runtime/routine";
import { SITE_ORIGIN } from "~/lib/site-meta";

// The day each public page of /sitemap.xml last changed that no row dates (the code-written hubs, and the Carrel pages
// until they have a publish revision). The daily page-dates job reads each as Markdown, the way a Markdown copy is
// made, with Prelum's trackPageDates, and keeps the day its text last changed in one row of `page_dates`. The sitemap
// reads it back. Same job as germomics and Foxing, on D1 because txasm has no KV namespace.
const PAGE_DATES_KEY = "sitemap";

export const TRACKED_PATHS = [
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
  "/accessibility",
];

/** Renders a path through the Worker's own page handler and returns its HTML, or null when it is not a page. workers/app.ts sets it. */
export type PageRenderer = (path: string, env: Env) => Promise<string | null>;
let renderPage: PageRenderer | undefined;
export function setPageRenderer(renderer: PageRenderer): void {
  renderPage = renderer;
}

/** The record the job keeps, from its D1 row. */
export const pageRecordStore = (env: Env) =>
  kvPageRecord(d1FireStore(env.DB, "page_dates"), PAGE_DATES_KEY);

/** The daily job: date every tracked page. */
export async function runPageDates(env: Env): Promise<{ rowsProcessed: number }> {
  if (!renderPage) throw new Error("page-dates: no page renderer is set");
  const render = renderPage;
  const store = pageRecordStore(env);
  const { record } = await trackPageDates({
    paths: TRACKED_PATHS,
    read: async (path) => {
      const html = await render(path, env);
      if (html === null) return null;
      const facts = htmlToMarkdown(html, { base: `${SITE_ORIGIN}${path}` });
      return `${facts.title}\n${facts.description}\n${facts.markdown}`;
    },
    load: store.load,
    save: store.save,
  });
  return { rowsProcessed: Object.keys(record).length };
}
