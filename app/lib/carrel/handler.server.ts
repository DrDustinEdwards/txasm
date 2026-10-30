// Carrel's site API, mounted by workers/app.ts at /api/carrel/v1. One key (CARREL_SITE_KEY, a Worker
// secret) reaches only that prefix and nothing else on the site.
import { submitIndexNow } from "@drdustinedwards/site-helpers/indexnow";
import { createSiteApi, indexNowHook } from "@dustinedwards/site-api";
import { INDEXNOW_KEY, SITE_ORIGIN } from "~/lib/site-meta";
import { createCarrelAdapter } from "./adapter.server";

export function carrelApi(env: Env) {
  return createSiteApi({
    adapter: createCarrelAdapter(env),
    key: env.CARREL_SITE_KEY,
    limiter: env.CARREL_RATE_LIMIT,
    log: (entry) => console.log(JSON.stringify(entry)),
    // A changed live page tells IndexNow, under ctx.waitUntil (workers/app.ts passes ctx); a request
    // from another origin (workers.dev, a preview) sends nothing.
    hooks: [indexNowHook({ submit: submitIndexNow, origin: SITE_ORIGIN, key: INDEXNOW_KEY })],
  });
}
