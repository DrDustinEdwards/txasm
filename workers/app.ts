import { WorkerEntrypoint } from "cloudflare:workers";
import { createRequestHandler, RouterContextProvider, type ServerBuild } from "react-router";
import { withAdminIdle } from "@dustinedwards/site-runtime/access";
import { receiveCspReport } from "@dustinedwards/site-runtime/csp-report";
import {
  SHARED_CACHE_CONTROL,
  cacheKey,
  forReader,
  forRenderer,
  privateRender,
  purgeAfterWrite,
  settleCacheHeaders,
  withPurgePages,
} from "@dustinedwards/site-runtime/edge-cache";
import { runJobs } from "@dustinedwards/site-runtime/cron";
import { logEvent, withRequestLog } from "@dustinedwards/site-runtime/log";
import { countNotFound } from "@dustinedwards/site-runtime/not-found";
import { generateNonce, renewNonce } from "@dustinedwards/site-runtime/csp";
import { refuseCrossSite } from "@dustinedwards/site-runtime/origin";
import { preloads, rootStylesheets, withPreloadHeader } from "@dustinedwards/site-runtime/preload";
import { SPECULATION_RULES_HEADER, SPECULATION_RULES_PATH, speculationRulesResponse } from "@dustinedwards/site-runtime/prefetch";
import { timedRender } from "@dustinedwards/site-runtime/server-timing";
import { canonicalRedirect } from "@dustinedwards/site-runtime/url";
import { cloudflareContext, cspNonceContext, pagePreviewContext } from "../app/load-context";
import { SECURITY_HEADERS } from "../app/lib/header-set";
import { CSP_REPORT_PATH, withSecurityHeaders } from "../app/lib/security-headers";
import { carrelRequestApi, isCarrelRequest } from "../app/lib/carrel/handler.server";
import type { PublishedPage } from "../app/lib/data-access";
import { cronJobs } from "../app/lib/cron.server";
import { FONT_PRELOADS } from "../app/lib/preloads";
import { ROBOTS_DISALLOW, isPrivatePath } from "../app/lib/site-meta";

// A preview link's token (Carrel's /preview/<token>), cut from a logged path.
const PREVIEW_TOKEN = /\/(preview)\/[^/?#\s'"]+/g;

const serverBuild = () => import("virtual:react-router/server-build") as Promise<ServerBuild>;
const requestHandler = createRequestHandler(serverBuild, import.meta.env.MODE);

// What the hover prefetch (site-runtime ./prefetch, beyond its NEVER_PREFETCH) never fetches: every private path
// (robots.txt's Disallow list: sign-in and its emailed confirm link, sign-out, the account, an author's abstracts,
// submission and editing, review and the admin and chair areas, /admin/access among them), registration and its
// payment, and the files under /documents and /media, which open as files.
const PREFETCH_EXCLUDE = [...ROBOTS_DISALLOW, "/register", "/documents", "/media"];

// The Speculation-Rules header on every HTML page, live or stored (a stored page's headers are a copy, so the header
// is set on a new one): the page's links start loading when the pointer rests on them, with no script, which matters
// now that the public pages do not hydrate and React Router's own prefetch is gone (root.tsx).
function withSpeculationRules(page: Response): Response {
  if (!page.headers.get("Content-Type")?.startsWith("text/html")) return page;
  const headers = new Headers(page.headers);
  headers.set(SPECULATION_RULES_HEADER.name, SPECULATION_RULES_HEADER.value);
  return new Response(page.body, { status: page.status, statusText: page.statusText, headers });
}

const isWrite = (request: Request) => request.method !== "GET" && request.method !== "HEAD";

// Runs the React Router handler with the Cloudflare env and execution context, so loaders and actions reach
// bindings through context.get(cloudflareContext), never ambiently. `nonce` goes to the render (app/entry.server.tsx);
// without one, the page is rendered for the edge cache. Its time goes in Server-Timing. `preview` is Carrel's preview
// of a site page, which that page's route shows in place of the published row.
async function render(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  nonce: string | undefined,
  preview?: { slug: string; page: PublishedPage },
) {
  const context = new RouterContextProvider();
  context.set(cloudflareContext, { env, ctx });
  context.set(cspNonceContext, nonce);
  context.set(pagePreviewContext, preview);
  return timedRender(() => requestHandler(request, context));
}

// Early Hints: on a zone with Early Hints on, a page carrying a preload Link header is answered with a 103 first,
// so the browser starts the render-blocking stylesheet and the text's font while the Worker still renders
// (site-runtime ./preload).
async function withEarlyHints(page: Response): Promise<Response> {
  return withPreloadHeader(page, preloads([...rootStylesheets(await serverBuild()), ...FONT_PRELOADS]).header);
}

/**
 * The cacheable entrypoint (wrangler.jsonc `exports`): the public pages, rendered and then stored by the Workers
 * cache under the key the gateway names. The gateway sends only a GET or HEAD with no cookie on a page path, so what
 * renders here is the signed-out page in the default theme, the same for every reader. Its inline scripts are trusted
 * by hash, never a nonce, which every reader of a stored page would share. Every header a stored page leaves with is
 * set here, or it is missing from every hit. Only a route that returns publicPageHeaders() is stored; the rest leave
 * `private, no-store` (settleCacheHeaders).
 */
export class Renderer extends withPurgePages(WorkerEntrypoint<Env>) {
  override async fetch(request: Request): Promise<Response> {
    // The page is rendered with a nonce on its scripts and in its policy; the gateway gives each reader a fresh one
    // (renewNonce), so a stored page never hands two readers the same nonce.
    const nonce = generateNonce();
    const page = await withEarlyHints(withSecurityHeaders(await render(request, this.env, this.ctx, nonce), request, nonce));
    // With the request, it fails closed if the gateway's rule ever lets a cookie through: a page rendered for a
    // cookie, or one setting a cookie, is never stored.
    return settleCacheHeaders(page, request);
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

/**
 * THE GATEWAY. Cache disabled (wrangler.jsonc `exports`), so it runs on every request: CSP reports, Carrel's site
 * API, redirects, writes and every signed-in or private page answer here and are never stored; a cookieless read of
 * a public page goes to the Renderer, through the Workers cache.
 */
const site = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // One hop to the canonical address: https and no trailing slash (308 for a form post). First, so a plaintext
    // request never reaches the security headers, whose report endpoint must be https; the redirect takes them for
    // where it points.
    const redirect = canonicalRedirect(request);
    if (redirect) return withSecurityHeaders(redirect, new Request(redirect.headers.get("Location") ?? request.url));

    // CSP violation reports: site-runtime's receiver logs each one as a trimmed JSON
    // line (origin and path only, no address or user agent) and stores nothing. Per
    // address, through the CSP_REPORT_RATE_LIMIT binding; over it, a report is dropped
    // (still 204).
    if (url.pathname === CSP_REPORT_PATH) {
      const allow = async (r: Request) =>
        (await env.CSP_REPORT_RATE_LIMIT.limit({ key: r.headers.get("cf-connecting-ip") ?? "anon" })).success;
      return receiveCspReport(request, { allow, headers: SECURITY_HEADERS });
    }

    // The prefetch rules the pages' Speculation-Rules header names.
    if (url.pathname === SPECULATION_RULES_PATH) {
      return withSecurityHeaders(speculationRulesResponse({ exclude: PREFETCH_EXCLUDE }, request), request);
    }

    // Carrel's site API. Its own guard (prefix, rate limit, key, route) runs first and answers
    // everything under /api/carrel/v1; nothing else is served by it. A write it accepts (a page, a picture) purges.
    if (isCarrelRequest(url)) {
      // A preview renders the page's own route in-process, never through the edge cache.
      const carrel = await carrelRequestApi(env, rootStylesheets(await serverBuild()).map((s) => s.href), (path, preview) =>
        render(new Request(new URL(path, url.origin), { headers: { Accept: "text/html" } }), env, ctx, undefined, preview),
      );
      // A preview link Carrel made (/preview/<token>, no key): the page's current source in the site's stylesheet,
      // noindex and never stored. The package's no-referrer stays (the set does not overwrite), so the token, which is
      // the address, is never sent on.
      if (carrel.matchesPreviewLink(request)) return withSecurityHeaders(await carrel.servePreviewLink(request), request);
      if (carrel.matches(request)) {
        const response = await carrel.handle(request, ctx);
        // A write that can change a public page drops every stored page: Carrel's (the site pages, media) here, and
        // any admin action (settings, officers, awards, documents, editions, decisions, the program) below. A refused
        // purge is logged and the page is stale until it expires (a day).
        purgeAfterWrite(request, response, ctx, `carrel ${request.method} ${url.pathname}`);
        return withSecurityHeaders(response, request);
      }
    }

    // A cross-site browser POST (or other write) is refused before routing. React
    // Router checks the Origin of a page's own action, but resource routes (admin
    // downloads and JSON, the search APIs) never reach that check. An absent Origin
    // passes, so non-browser clients are unaffected. Better Auth checks its own
    // origins under /api/auth, so it is left to that.
    if (!url.pathname.startsWith("/api/auth/")) {
      const refused = refuseCrossSite(request);
      if (refused) return withSecurityHeaders(refused, request);
    }

    let page: Response;
    if (cacheable(request, url)) {
      // The key is the host (the share card is named on it, pageHead), the path and the query without tracking
      // parameters; a reader who already holds the page gets a 304.
      const stored = await ctx.exports.Renderer.fetch(forRenderer(request), { cf: { cacheKey: cacheKey(url, { dimensions: { host: url.host } }) } });
      // The cache answers a conditional request with its own 304, whose headers are immutable, so the policy is
      // dropped from a copy (deleting it in place threw, a 1101 for every returning reader, 2026-10-31). A 304 leaves
      // out the policy: the reader's copy keeps its own, whose nonce is the one in that copy's scripts.
      const reader = forReader(renewNonce(stored), request);
      if (reader.status === 304) {
        const headers = new Headers(reader.headers);
        headers.delete("Content-Security-Policy");
        page = new Response(null, { status: 304, headers });
      } else page = reader;
    } else {
      // Rendered live with this request's nonce, on the render and in its header; never stored.
      const nonce = generateNonce();
      const response = await render(request, env, ctx, nonce);
      if (url.pathname.startsWith("/admin")) purgeAfterWrite(request, response, ctx, `admin ${request.method} ${url.pathname}`);
      page = await withEarlyHints(withSecurityHeaders(response, request, nonce));
      // A route's public headers mean nothing on this path: it was rendered for one reader. A response with no
      // Cache-Control (a signed-in page, a redirect) is said to be private rather than left to heuristics.
      if (!page.headers.has("Cache-Control") || page.headers.get("Cache-Control") === SHARED_CACHE_CONTROL) {
        page = privateRender(page);
      }
    }
    // Each 404 to a GET counts against its path and referring host for the day (page_404_daily),
    // in waitUntil, so it never holds or fails the page. The path only, never the query.
    countNotFound(env.DB, request, page, ctx);
    return withSpeculationRules(page);
  },

  // The crons (see wrangler.jsonc), one job list each (app/lib/cron.server.ts), each job timed out and recorded in
  // cron_runs by site-runtime's runJobs, so /health notices one that failed, stopped or never ran. A failed job does
  // not stop the next; runJobs throws after the last, so the invocation shows as failed in Workers Logs. A cron with
  // no list (a trigger added in the dashboard or a misspelt key) runs nothing and says so.
  async scheduled(controller, env, _ctx) {
    const jobs = cronJobs(env, new Date(controller.scheduledTime))[controller.cron];
    if (!jobs) {
      logEvent("cron_unknown", { cron: controller.cron }, { level: "warn" });
      return;
    }
    await runJobs(env.DB, jobs);
  },
} satisfies ExportedHandler<Env>;

// An admin idle for an hour is signed out of Access (site-runtime ./access). Every request writes one `request` line
// (site-runtime ./log: path, status, ms and the deployed commit), a preview link's token cut from its path.
type IncomingRequest = Parameters<typeof site.fetch>[0];
export default {
  ...site,
  fetch: withRequestLog(
    (request: Request, env: Env, ctx: ExecutionContext) =>
      withAdminIdle(request, () => site.fetch(request as IncomingRequest, env, ctx)),
    { sha: (env) => (env as { DEPLOY_SHA?: string }).DEPLOY_SHA, tokenPath: PREVIEW_TOKEN },
  ),
} satisfies ExportedHandler<Env>;

// The sign-in's per-address limits (RATE_LIMITER, app/lib/auth.server.ts).
export { RateLimiter } from "@dustinedwards/site-runtime/rate-limit/durable-object";
