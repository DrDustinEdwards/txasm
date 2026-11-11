// Carrel's site API, mounted by workers/app.ts at /api/carrel/v1, with its preview links at /preview/<token>. One key
// (CARREL_SITE_KEY, a Worker secret) reaches only that prefix and nothing else on the site.
import { standardSiteApi, type PublishHook } from "@dustinedwards/site-api";
import { INDEXNOW_KEY, publicOrigin } from "~/lib/site-meta";
import { createCarrelAdapter, type RenderPage } from "./adapter.server";

/**
 * Only what changes a page a reader sees. A save to a txasm page changes its working copy, never the live route, yet
 * is announced as an "update"; a publish, and the update the cron puts live, are what move the page.
 */
function liveChanges(hook: PublishHook): PublishHook {
  return {
    ...hook,
    run: (event) =>
      event.action === "update" && event.trigger === "request" ? true : hook.run(event),
  };
}

export function carrelApi(
  env: Env,
  options: { renderVersion?: string; stylesheets?: string[]; renderPage?: RenderPage } = {},
) {
  // The replay store (safe retries by change id), preview links, failed hooks' retries and the webmentions sent
  // (drizzle/0027_site_api_tables.sql). A changed live page tells IndexNow and the pages it links to, under
  // ctx.waitUntil; IndexNow sends nothing for a request from another origin (workers.dev, a preview). A schedule the
  // cron puts live purges the stored pages, as the gateway does after a Carrel write.
  return standardSiteApi({
    adapter: createCarrelAdapter(env, options),
    key: env.CARREL_SITE_KEY,
    limiter: env.CARREL_RATE_LIMIT,
    db: env.DB,
    indexNow: { origin: publicOrigin(env), key: INDEXNOW_KEY },
    hooks: ({ indexNow, purge, webmention }) => [
      indexNow && liveChanges(indexNow),
      purge,
      liveChanges(webmention),
    ],
  });
}

/** Carrel's API for one of its requests, with the Prelum render its meta names: the renderer loads only here. */
export async function carrelRequestApi(env: Env, stylesheets: string[], renderPage: RenderPage) {
  const { RENDER_VERSION } = await import("@drdustinedwards/site-helpers/render/nomath");
  return carrelApi(env, { renderVersion: RENDER_VERSION, stylesheets, renderPage });
}

/**
 * The per-minute cron's job (workers/app.ts): every update that is due goes live, with the hooks a Carrel publish
 * runs, and hooks that failed earlier are tried again. One that fails fails the job, and is tried next minute.
 */
export async function runCarrelSchedules(env: Env, now: Date): Promise<void> {
  await carrelApi(env).runSchedulesOrThrow({ now });
}
