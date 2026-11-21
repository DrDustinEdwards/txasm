import { kvPageRecord, trackPageDates } from "@drdustinedwards/site-helpers/lastmod";
import { htmlToMarkdown } from "@drdustinedwards/site-helpers/markdown-copy";

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
  kvPageRecord(
    {
      get: () => env.DB.prepare("SELECT value FROM page_dates").first<string>("value"),
      put: (key, value) =>
        env.DB.prepare("REPLACE INTO page_dates VALUES (?1, ?2)").bind(key, value).run(),
    },
    PAGE_DATES_KEY,
  );

/** The daily job: date every tracked page. */
export async function runPageDates(env: Env): Promise<void> {
  const render = renderPage!;
  const store = pageRecordStore(env);
  await trackPageDates({
    paths: TRACKED_PATHS,
    read: async (path) => {
      const html = await render(path, env);
      return html && htmlToMarkdown(html).markdown;
    },
    load: store.load,
    save: store.save,
  });
}
