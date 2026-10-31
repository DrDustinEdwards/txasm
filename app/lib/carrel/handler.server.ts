// Carrel's site API, mounted by workers/app.ts at /api/carrel/v1, with its preview links at /preview/<token>. One key
// (CARREL_SITE_KEY, a Worker secret) reaches only that prefix and nothing else on the site.
import { submitIndexNow } from "@drdustinedwards/site-helpers/indexnow";
import {
  createSiteApi,
  indexNowHook,
  insidePrefix,
  PREVIEW_LINK_PATH,
  webmentionHook,
  type PublishHook,
} from "@dustinedwards/site-api";
import { d1SiteApiStore } from "@dustinedwards/site-api/store";
import { schedulePurgeHook } from "@dustinedwards/site-runtime/edge-cache";
import { INDEXNOW_KEY, SITE_ORIGIN } from "~/lib/site-meta";
import { createCarrelAdapter } from "./adapter.server";

/**
 * Only what changes a page a reader sees. A save to a txasm page changes its working copy, never the live route, yet
 * is announced as an "update"; a publish, and the update the cron puts live, are what move the page.
 */
function liveChanges(hook: PublishHook): PublishHook {
  return { ...hook, run: (event) => (event.action === "update" && event.trigger === "request" ? true : hook.run(event)) };
}

/** A request the site API or a preview link answers (or refuses): the only ones that load it. */
export const isCarrelRequest = (url: URL) => insidePrefix(url.pathname) || url.pathname.startsWith(PREVIEW_LINK_PATH);

export function carrelApi(env: Env, options: { renderVersion?: string; stylesheets?: string[] } = {}) {
  // The replay store (safe retries by change id), preview links, failed hooks' retries and the webmentions sent
  // (drizzle/0027_site_api_tables.sql).
  const store = d1SiteApiStore(env.DB);
  return createSiteApi({
    adapter: createCarrelAdapter(env, options),
    key: env.CARREL_SITE_KEY,
    limiter: env.CARREL_RATE_LIMIT,
    log: (entry) => console.log(JSON.stringify(entry)),
    store,
    // A changed live page tells IndexNow and the pages it links to, under ctx.waitUntil (workers/app.ts passes ctx);
    // IndexNow sends nothing for a request from another origin (workers.dev, a preview). A schedule the cron puts live
    // purges the stored pages, as the gateway does after a Carrel write.
    hooks: [
      liveChanges(indexNowHook({ submit: submitIndexNow, origin: SITE_ORIGIN, key: INDEXNOW_KEY })),
      schedulePurgeHook(),
      liveChanges(webmentionHook({ store })),
    ],
  });
}

/** Carrel's API for one of its requests, with the Prelum render its meta names: the renderer loads only here. */
export async function carrelRequestApi(env: Env, stylesheets: string[]) {
  const { RENDER_VERSION } = await import("@drdustinedwards/site-helpers/render/nomath");
  return carrelApi(env, { renderVersion: RENDER_VERSION, stylesheets });
}

/**
 * The per-minute cron's job (workers/app.ts): every update that is due goes live, with the hooks a Carrel publish
 * runs, and hooks that failed earlier are tried again. One that fails fails the job, and is tried next minute.
 */
export async function runCarrelSchedules(env: Env, now: Date): Promise<void> {
  const run = await carrelApi(env).runSchedules({ now });
  if (run.failed > 0) throw new Error(`${run.failed} Carrel schedule(s) failed`);
}
