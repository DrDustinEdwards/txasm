import { WorkerEntrypoint } from "cloudflare:workers";
import { createRequestHandler, RouterContextProvider, type ServerBuild } from "react-router";
import { receiveCspReport } from "@dustinedwards/site-runtime/csp-report";
import {
  EDGE_CACHE_HEADER,
  SHARED_CACHE_CONTROL,
  UNCACHED,
  cacheKey,
  forReader,
  purgeTags,
  settleCacheHeaders,
} from "@dustinedwards/site-runtime/edge-cache";
import { countNotFound } from "@dustinedwards/site-runtime/not-found";
import { refuseCrossOrigin } from "@dustinedwards/site-runtime/origin";
import { preloads } from "@dustinedwards/site-runtime/preload";
import { slashRedirect } from "@dustinedwards/site-runtime/url";
import { cloudflareContext, cspNonceContext } from "../app/load-context";
import { runNightlyBackup } from "../app/lib/backup.server";
import {
  CSP_REPORT_PATH,
  SECURITY_HEADERS,
  inlineScriptHashes,
  newCspNonce,
  withSecurityHeaders,
} from "../app/lib/security-headers";
import { carrelApi } from "../app/lib/carrel/handler.server";
import { isPrivatePath } from "../app/lib/site-meta";

const serverBuild = () => import("virtual:react-router/server-build") as Promise<ServerBuild>;
const requestHandler = createRequestHandler(serverBuild, import.meta.env.MODE);

const isHtml = (response: Response) => response.headers.get("Content-Type")?.startsWith("text/html") ?? false;
const isWrite = (request: Request) => request.method !== "GET" && request.method !== "HEAD";

// Runs the React Router handler with the Cloudflare env and execution context, so loaders and actions reach
// bindings through context.get(cloudflareContext), never ambiently. `nonce` goes to the render (app/entry.server.tsx);
// without one, the page is rendered for the edge cache.
async function render(request: Request, env: Env, ctx: ExecutionContext, nonce: string | undefined) {
  const context = new RouterContextProvider();
  context.set(cloudflareContext, { env, ctx });
  context.set(cspNonceContext, nonce);
  return requestHandler(request, context);
}

// Early Hints: on a zone with Early Hints on, a page carrying a preload Link header is answered with a 103 first,
// so the browser starts the render-blocking stylesheet while the Worker still renders (site-runtime ./preload).
async function withEarlyHints(page: Response): Promise<Response> {
  if (isHtml(page)) {
    const stylesheets = (await serverBuild()).assets.routes.root?.css ?? [];
    const { header } = preloads(stylesheets.map((href) => ({ href, as: "style" as const })));
    if (header) page.headers.append("Link", header);
  }
  return page;
}

/**
 * The cacheable entrypoint (wrangler.jsonc `exports`): the public pages, rendered and then stored by the Workers
 * cache under the key the gateway names. The gateway sends only a GET or HEAD with no cookie on a page path, so what
 * renders here is the signed-out page in the default theme, the same for every reader. Its inline scripts are trusted
 * by hash, never a nonce, which every reader of a stored page would share. Every header a stored page leaves with is
 * set here, or it is missing from every hit. Only a route that returns publicPageHeaders() is stored; the rest leave
 * `private, no-store` (settleCacheHeaders).
 */
export class Renderer extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    let response = await render(request, this.env, this.ctx, undefined);
    let scriptHashes: string[] = [];
    if (isHtml(response)) {
      const html = await response.text();
      scriptHashes = await inlineScriptHashes(html);
      response = new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    const page = await withEarlyHints(withSecurityHeaders(response, request, { scriptHashes }));
    // Fails closed if the gateway's rule ever lets one through: a page rendered for a cookie, or one setting a
    // cookie, is never stored.
    if (request.headers.has("Cookie") || page.headers.has("Set-Cookie")) page.headers.set("Cache-Control", UNCACHED);
    return settleCacheHeaders(page);
  }

  /**
   * Drops every stored page. A purge reaches only the cache of the entrypoint that calls it, so it runs here, called
   * over RPC from the gateway (which stores nothing); RPC methods bypass the cache.
   */
  async purgePages(why: string): Promise<void> {
    await purgeTags(this.ctx.cache, ["pages"], why);
  }
}

// What may go to the Renderer: a read of a page path (or its React Router .data twin) with no cookie. A cookie means
// a signed-in reader (Better Auth's session) or a chosen theme (txasm_theme), and either changes the page, so it is
// rendered live with its nonce, as before the edge cache. Private paths (robots.txt's Disallow list), the media
// library, documents and the text files (robots.txt, sitemap.xml, the feed: their own hour of Cache-Control, which the
// Workers cache would honor without a purge) never go.
function cacheable(request: Request, url: URL): boolean {
  if (isWrite(request) || request.headers.has("Cookie")) return false;
  const path = url.pathname;
  if (isPrivatePath(path) || path.startsWith("/media/") || path.startsWith("/documents/") || path === "/health") return false;
  const last = path.slice(path.lastIndexOf("/") + 1);
  return !last.includes(".") || last.endsWith(".data");
}

// A write that can change a public page drops every stored page: Carrel's (the site pages, media) and any admin
// action (settings, officers, awards, documents, editions, decisions, the program). Never throws; a refused purge is
// logged and the page is stale until it expires (a day).
function purgePagesAfter(request: Request, response: Response, ctx: ExecutionContext, why: string) {
  if (isWrite(request) && response.status < 400) ctx.waitUntil(ctx.exports.Renderer.purgePages(why));
}

/**
 * THE GATEWAY. Cache disabled (wrangler.jsonc `exports`), so it runs on every request: CSP reports, Carrel's site
 * API, redirects, writes and every signed-in or private page answer here and are never stored; a cookieless read of
 * a public page goes to the Renderer, through the Workers cache.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // CSP violation reports: site-runtime's receiver logs each one as a trimmed JSON
    // line (origin and path only, no address or user agent) and stores nothing. Per
    // address, through the CSP_REPORT_RATE_LIMIT binding; over it, a report is dropped
    // (still 204).
    if (url.pathname === CSP_REPORT_PATH) {
      const allow = async (r: Request) =>
        (await env.CSP_REPORT_RATE_LIMIT.limit({ key: r.headers.get("cf-connecting-ip") ?? "anon" })).success;
      return receiveCspReport(request, { allow, headers: SECURITY_HEADERS });
    }

    // Carrel's site API. Its own guard (prefix, rate limit, key, route) runs first and answers
    // everything under /api/carrel/v1; nothing else is served by it. A write it accepts (a page, a picture) purges.
    const carrel = carrelApi(env);
    if (carrel.matches(request)) {
      const response = await carrel.handle(request, ctx);
      purgePagesAfter(request, response, ctx, `carrel ${request.method} ${url.pathname}`);
      return withSecurityHeaders(response, request);
    }

    // One address per page: /x/ answers 301 to /x (308 for a form post).
    const slash = slashRedirect(request);
    if (slash) return withSecurityHeaders(slash, request);

    // A cross-origin browser POST (or other write) is refused before routing. React
    // Router checks the Origin of a page's own action, but resource routes (admin
    // downloads and JSON, the search APIs) never reach that check. An absent Origin
    // passes, so non-browser clients are unaffected. Better Auth checks its own
    // origins under /api/auth, so it is left to that.
    if (!url.pathname.startsWith("/api/auth/")) {
      const refused = refuseCrossOrigin(request);
      if (refused) return withSecurityHeaders(refused, request);
    }

    let page: Response;
    if (cacheable(request, url)) {
      const stored = await ctx.exports.Renderer.fetch(request, { cf: { cacheKey: cacheKey(request.url) } });
      page = forReader(stored, request);
    } else {
      // Rendered live with this request's nonce, on the render and in its header; never stored.
      const nonce = newCspNonce();
      const response = await render(request, env, ctx, nonce);
      if (url.pathname.startsWith("/admin")) purgePagesAfter(request, response, ctx, `admin ${request.method} ${url.pathname}`);
      page = await withEarlyHints(withSecurityHeaders(response, request, { nonce }));
      // A route's public headers mean nothing on this path: it was rendered for one reader. A response with no
      // Cache-Control (a signed-in page, a redirect) is said to be private rather than left to heuristics.
      if (!page.headers.has("Cache-Control") || page.headers.get("Cache-Control") === SHARED_CACHE_CONTROL) {
        page.headers.set("Cache-Control", UNCACHED);
        page.headers.delete(EDGE_CACHE_HEADER);
        page.headers.delete("Cache-Tag");
      }
    }
    // Each 404 to a GET counts against its path for the day (page_404_daily), in
    // waitUntil, so it never holds or fails the page. The path only, never the query.
    countNotFound(env.DB, request, page, ctx);
    return page;
  },

  // The cron fires daily (see wrangler.jsonc). It takes the nightly D1 backup;
  // the deadline jobs and reminders (submission and review deadline reminders,
  // status transitions) are wired per edition in a later phase. A failed backup
  // throws so the run shows as failed in Workers Logs.
  async scheduled(controller, env, _ctx) {
    console.log(
      `[cron] tick ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()}`,
    );
    await runNightlyBackup(env);
  },
} satisfies ExportedHandler<Env>;

// The sign-in's per-address limits (RATE_LIMITER, app/lib/auth.server.ts).
export { RateLimiter } from "@dustinedwards/site-runtime/rate-limit/durable-object";
