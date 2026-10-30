import { createRequestHandler, RouterContextProvider } from "react-router";
import { receiveCspReport } from "@dustinedwards/site-runtime/csp-report";
import { countNotFound } from "@dustinedwards/site-runtime/not-found";
import { refuseCrossOrigin } from "@dustinedwards/site-runtime/origin";
import { slashRedirect } from "@dustinedwards/site-runtime/url";
import { cloudflareContext, cspNonceContext } from "../app/load-context";
import { runNightlyBackup } from "../app/lib/backup.server";
import {
  CSP_REPORT_PATH,
  SECURITY_HEADERS,
  newCspNonce,
  withSecurityHeaders,
} from "../app/lib/security-headers";
import { carrelApi } from "../app/lib/carrel/handler.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // CSP violation reports: site-runtime's receiver logs each one as a trimmed JSON
    // line (origin and path only, no address or user agent) and stores nothing. Per
    // address, through the CSP_REPORT_RATE_LIMIT binding; over it, a report is dropped
    // (still 204).
    if (new URL(request.url).pathname === CSP_REPORT_PATH) {
      const allow = async (r: Request) =>
        (await env.CSP_REPORT_RATE_LIMIT.limit({ key: r.headers.get("cf-connecting-ip") ?? "anon" })).success;
      return receiveCspReport(request, { allow, headers: SECURITY_HEADERS });
    }

    // Carrel's site API. Its own guard (prefix, rate limit, key, route) runs first and answers
    // everything under /api/carrel/v1; nothing else is served by it.
    const carrel = carrelApi(env);
    if (carrel.matches(request)) return withSecurityHeaders(await carrel.handle(request, ctx), request);

    // One address per page: /x/ answers 301 to /x (308 for a form post).
    const slash = slashRedirect(request);
    if (slash) return withSecurityHeaders(slash, request);

    // A cross-origin browser POST (or other write) is refused before routing. React
    // Router checks the Origin of a page's own action, but resource routes (admin
    // downloads and JSON, the search APIs) never reach that check. An absent Origin
    // passes, so non-browser clients are unaffected. Better Auth checks its own
    // origins under /api/auth, so it is left to that.
    if (!new URL(request.url).pathname.startsWith("/api/auth/")) {
      const refused = refuseCrossOrigin(request);
      if (refused) return withSecurityHeaders(refused, request);
    }

    // Inject the Cloudflare env and execution context so loaders and actions
    // reach bindings through context.get(cloudflareContext), never ambiently.
    // The page's CSP nonce goes to the render and to its header.
    const nonce = newCspNonce();
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    context.set(cspNonceContext, nonce);
    const response = await requestHandler(request, context);
    // Each 404 to a GET counts against its path for the day (page_404_daily), in
    // waitUntil, so it never holds or fails the page. The path only, never the query.
    countNotFound(env.DB, request, response, ctx);
    return withSecurityHeaders(response, request, nonce);
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
