// aislop-ignore-next-line ai-slop/hallucinated-import -- a Workers built-in, not an npm package
import { WorkerEntrypoint } from "cloudflare:workers";
import type { ServerBuild } from "react-router";
import { siteApiStep } from "@dustinedwards/site-api";
import { standardFiles } from "@drdustinedwards/site-helpers/files";
import { defineSite, siteRenderer, siteWorker } from "@dustinedwards/site-runtime/worker";
import { withSecurityHeaders } from "../app/lib/security-headers";
import { carrelRequestApi } from "../app/lib/carrel/handler.server";
import { getDataAccess } from "../app/lib/data-access";
import { pagePreviewContext } from "../app/lib/preview-context";
import { allCronJobs, cronJobs } from "../app/lib/cron.server";
import { operatorTools } from "../app/lib/operator.server";
import { FONT_PRELOADS } from "../app/lib/preloads";
import {
  INDEXNOW_KEY,
  ROBOTS_DISALLOW,
  SITE_NAME,
  SITE_ORIGIN,
  isPrivatePath,
} from "../app/lib/site-meta";

// The sign-in's per-address limits (RATE_LIMITER, app/lib/auth.server.ts).
export { RateLimiter } from "@dustinedwards/site-runtime/rate-limit/durable-object";

/**
 * The site's Worker: site-runtime's gateway, Renderer, request log and cron (./worker), with what is this site's own:
 * its machine files, the operator tools, Carrel's site API with its in-process page preview, the private paths kept
 * out of the edge cache and the admin idle sign-out. A cookie (a session or the chosen theme) means a live render.
 */
const site = defineSite<Env>({
  name: SITE_NAME,
  serverBuild: () => import("virtual:react-router/server-build") as Promise<ServerBuild>,
  mode: import.meta.env.MODE,
  withSecurityHeaders,
  // robots.txt, ai.txt (named from the settings in D1), site.webmanifest and the IndexNow key file (Prelum ./files).
  // Until the txasm.org cutover the workers.dev copy is a preview, told Disallow: / for everyone.
  files: (request, env) =>
    standardFiles({
      origin: SITE_ORIGIN,
      disallow: ROBOTS_DISALLOW,
      indexNowKey: INDEXNOW_KEY,
      ai: async () => {
        const settings = await getDataAccess(env).settings.get();
        return {
          name: settings.orgName || "Texas Branch of the American Society for Microbiology",
          contact: settings.contactEmail ?? `${SITE_ORIGIN}/contact`,
        };
      },
      manifest: {
        name: "Texas Branch of the American Society for Microbiology",
        shortName: SITE_NAME,
        themeColor: "#002868",
        backgroundColor: "#ffffff",
      },
    })(request),
  // What the hover prefetch never fetches: every private path (robots.txt's Disallow list), registration and its
  // payment, and the files under /documents and /media, which open as files.
  speculationExclude: [...ROBOTS_DISALLOW, "/register", "/documents", "/media"],
  operator: (env) => operatorTools(env, () => allCronJobs(env)),
  steps: [
    // Carrel's site API under /api/carrel/v1 and its preview links (site-api's step). A preview renders the page's own
    // route in-process, never through the edge cache; a write it accepts (a page, a picture) purges the stored pages.
    // The step is made per request so its preview render has this request's kit (site-api's StepKit has no render).
    (request, env, ctx, kit) =>
      siteApiStep<Env>(async () =>
        carrelRequestApi(env, await kit.stylesheets(), (path, preview) =>
          kit.render(
            new Request(new URL(path, kit.url.origin), { headers: { Accept: "text/html" } }),
            {
              set: (context) => context.set(pagePreviewContext, preview),
            },
          ),
        ),
      )(request, env, ctx, kit),
  ],
  // Private paths (robots.txt's Disallow list), the media library and the documents are never stored.
  cacheable: (_request, url) =>
    !(
      isPrivatePath(url.pathname) ||
      url.pathname.startsWith("/media/") ||
      url.pathname.startsWith("/documents/")
    ),
  preloads: FONT_PRELOADS,
  // No Carrel preview on an ordinary render: the page's route shows its published row (a preview step sets one).
  context: (context) => context.set(pagePreviewContext, undefined),
  // An admin idle for an hour is signed out of Access (site-runtime ./access).
  adminIdle: [{ secret: (env) => env.ADMIN_IDLE_SECRET }],
  cron: cronJobs,
});

export class Renderer extends siteRenderer(WorkerEntrypoint<Env>, site) {}

export default siteWorker(site) satisfies ExportedHandler<Env>;
