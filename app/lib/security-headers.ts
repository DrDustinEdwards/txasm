// The security headers every response from this Worker carries: the family standard
// from @dustinedwards/site-runtime, with one override, the passkey sign-in's
// Permissions-Policy (PASSKEY_OVERRIDES). X-Frame-Options: deny is the
// part that matters most here: a framed admin page could otherwise submit a role
// grant or a book publish with the chair's cookie (Grok audit 2026-10-21, TX-1).
import { TDM_RESERVATION_HEADERS } from "@drdustinedwards/site-helpers/robots";
import { PASSKEY_OVERRIDES, applyHeaderSet, buildSecurityHeaders } from "@dustinedwards/site-runtime/headers";
import { buildContentSecurityPolicy, generateNonce, reportingEndpoints, scriptHash } from "@dustinedwards/site-runtime/csp";
import { TURNSTILE_ORIGIN } from "@dustinedwards/site-runtime/turnstile";
import { isPrivatePath } from "./site-meta";

// The house set plus Prelum's TDMRep header, which reserves training rights as /ai.txt says.
export const SECURITY_HEADERS = {
  ...buildSecurityHeaders({ overrides: PASSKEY_OVERRIDES }),
  ...TDM_RESERVATION_HEADERS,
};

/** Where browsers send violation reports (report-uri), and the Reporting API name for it (report-to). */
export const CSP_REPORT_PATH = "/csp-report";
const CSP_ENDPOINT = "csp-endpoint";

/**
 * A fresh nonce for one page render, for a page that is never stored: a signed-in or private page, or any request
 * carrying a cookie (workers/app.ts). A page the edge may store is rendered without one and trusts its inline
 * scripts by hash (inlineScriptHashes), since every reader of a stored page would share its nonce.
 */
export const newCspNonce = generateNonce;

/** The policy a page's inline scripts run under: this render's nonce, or the hashes of the scripts it holds. */
export type ScriptTrust = { nonce?: string; scriptHashes?: readonly string[] };

// An inline <script> (no src) and its text. React Router writes its hydration data and module import inline, and
// escapes "</" inside them, so the first closing tag ends each one.
const INLINE_SCRIPT = /<script\b(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;

/** The `sha256-...` source of every distinct inline script in a rendered page, for a page rendered with no nonce. */
export async function inlineScriptHashes(html: string): Promise<string[]> {
  const texts = new Set<string>();
  for (const match of html.matchAll(INLINE_SCRIPT)) texts.add(match[1] ?? "");
  return Promise.all([...texts].map((text) => scriptHash(text)));
}

// What the pages load beyond 'self', read from the code (2026-10-24):
// - style, font: nothing. Inter is bundled (app/app.css); the serif faces and PDF.js (its module, worker, wasm,
//   fonts, cmaps) are self-hosted in public/.
// - img: only 'self' (the favicon, /documents/<slug>/inline).
// - script: 'self' plus this request's nonce, which React Router puts on its inline hydration and
//   streaming scripts (app/entry.server.tsx); or, on a page the edge may store, the hashes of those scripts.
// - script, frame: Cloudflare Turnstile on the sign-in form (app/routes/signin.tsx).
// - style attributes: React style={{...}} props (brand marks, the program grid), which a nonce
//   cannot cover.
// Not listed, so reported: the book preview's Paged.js (unpkg) and its inline styles and config
// script (app/lib/paged.ts), and any external image in D1 content.
// - The Cloudflare Web Analytics beacon, allowed like every family site. On workers.dev the edge injects
//   none; once txasm.org is on the zone, it does.
// Report-Only until the reports show nothing the pages need is missing.
function contentSecurityPolicy({ nonce, scriptHashes }: ScriptTrust) {
  return buildContentSecurityPolicy({
    sources: {
      script: [TURNSTILE_ORIGIN],
      frame: [TURNSTILE_ORIGIN],
    },
    nonce,
    scriptHashes,
    styleAttributesInline: true,
    cloudflareWebAnalytics: true,
    reportUri: CSP_REPORT_PATH,
    reportTo: CSP_ENDPOINT,
    reportOnly: true,
  });
}

// A route's own value wins (the image document CSP and nosniff), so the set is
// applied without overwriting, and the page policy is added only when the route
// declared none. Headers can be immutable on some responses, so the response is
// rebuilt around a fresh copy. `trust` is the nonce the page was rendered with, or its inline scripts' hashes.
// Signed-in, admin and API paths (robots.txt's Disallow list) also get X-Robots-Tag: noindex,
// which covers their resource routes and redirects, where no meta tag can go.
export function withSecurityHeaders(response: Response, request: Request, trust: ScriptTrust = {}): Response {
  const headers = new Headers(response.headers);
  applyHeaderSet(headers, SECURITY_HEADERS, { overwrite: false });
  if (!headers.has("Content-Security-Policy") && !headers.has("Content-Security-Policy-Report-Only")) {
    const csp = contentSecurityPolicy(trust);
    headers.set(csp.name, csp.value);
  }
  headers.set("Reporting-Endpoints", reportingEndpoints(CSP_ENDPOINT, new URL(CSP_REPORT_PATH, request.url)));
  if (isPrivatePath(new URL(request.url).pathname)) headers.set("X-Robots-Tag", "noindex");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
