import { operatorJobTools } from "@dustinedwards/site-runtime/cron";
import { isSiteApiRequest } from "@dustinedwards/site-api";
import { WorkerEntrypoint } from "cloudflare:workers";
import type { ServerBuild } from "react-router";
import {
  defineSite,
  siteRenderer,
  siteWorker,
  type GatewayStep,
} from "@dustinedwards/site-runtime/worker";
import { withSecurityHeaders } from "../app/lib/security-headers";
import { carrelRequestApi } from "../app/lib/carrel/handler.server";
import { pagePreviewContext } from "../app/lib/preview-context";
import { allCronJobs, cronJobs } from "../app/lib/cron.server";
import { backupStatus } from "../app/lib/backup.server";
import { FONT_PRELOADS } from "../app/lib/preloads";
import { ROBOTS_DISALLOW, isPrivatePath } from "../app/lib/site-meta";

/**
 * Carrel's site API under /api/carrel/v1 and its preview links (/preview/<token>, no key): the page's current source in
 * the site's stylesheet, noindex and never stored, and the package's no-referrer stays (the set does not overwrite), so
 * the token, which is the address, is never sent on. A preview renders the page's own route in-process, with the
 * preview in place of the published row, never through the edge cache. A write it accepts (a page, a picture) purges
 * the stored pages; an admin write does too (the shared purgeAfter, /admin).
 */
const carrel: GatewayStep<Env> = async (request, env, ctx, kit) => {
  if (!isSiteApiRequest(kit.url)) return undefined;
  const api = await carrelRequestApi(env, await kit.stylesheets(), (path, preview) =>
    kit.render(new Request(new URL(path, kit.url.origin), { headers: { Accept: "text/html" } }), {
      set: (context) => context.set(pagePreviewContext, preview),
    }),
  );
  if (api.matchesPreviewLink(request)) return api.servePreviewLink(request);
  if (!api.matches(request)) return undefined;
  const response = await api.handle(request, ctx);
  kit.purgeAfterWrite(request, response, `carrel ${request.method} ${kit.url.pathname}`);
  return response;
};

/**
 * The site's Worker (site-runtime ./worker): the gateway, the Renderer the Workers cache stores the public pages from,
 * the request log and the crons. What is txasm's own: its security set, Carrel's site API, the operator API's tools,
 * the paths never stored, the hover prefetch's exclusions, the text font's preload, the admin idle sign-out and the
 * cron lists (app/lib/cron.server.ts).
 */
const site = defineSite<Env>({
  name: "Texas Branch ASM",
  serverBuild: () => import("virtual:react-router/server-build") as Promise<ServerBuild>,
  mode: import.meta.env.MODE,
  withSecurityHeaders,
  // What the hover prefetch never fetches: every private path (robots.txt's Disallow list), registration and its
  // payment, and the files under /documents and /media, which open as files.
  speculationExclude: [...ROBOTS_DISALLOW, "/register", "/documents", "/media"],
  // Capsid Admin's backups and run_job, behind the OPERATOR_TOKEN bearer.
  operator: (env) =>
    operatorJobTools({
      db: env.DB,
      jobs: () => allCronJobs(env),
      backupStatus: () => backupStatus(env),
      files: ["uploads"],
    }),
  steps: [carrel],
  // Never stored: private paths (robots.txt's Disallow list), the media library, documents, and any path with a file
  // extension but .data (robots.txt, sitemap.xml, the feed: their own hour of Cache-Control, which the Workers cache
  // would honor without a purge). A cookie (a session or the chosen theme) already means a live render.
  cacheable: (_request, url) => {
    const path = url.pathname;
    if (isPrivatePath(path) || path.startsWith("/media/") || path.startsWith("/documents/"))
      return false;
    const last = path.slice(path.lastIndexOf("/") + 1);
    return !last.includes(".") || last.endsWith(".data");
  },
  // Early Hints: the text's font beside the root stylesheet.
  preloads: FONT_PRELOADS,
  // An admin idle for an hour is signed out of Access (site-runtime ./access).
  adminIdle: [{ secret: (env) => env.ADMIN_IDLE_SECRET }],
  cron: cronJobs,
});

export class Renderer extends siteRenderer(WorkerEntrypoint<Env>, site) {}

export default siteWorker(site) satisfies ExportedHandler<Env>;

// The sign-in's per-address limits (RATE_LIMITER, app/lib/auth.server.ts).
export { RateLimiter } from "@dustinedwards/site-runtime/rate-limit/durable-object";
