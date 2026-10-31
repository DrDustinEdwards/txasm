// The security headers every response from this Worker carries: the set (header-set.ts) and the page's
// Content-Security-Policy. X-Frame-Options: deny is the part that matters most here: a framed admin page could
// otherwise submit a role grant or a book publish with the chair's cookie.
import { applyHeaderSet } from "@dustinedwards/site-runtime/headers";
import { buildContentSecurityPolicy, buildStagedPolicy, reportingEndpoints, scriptHash } from "@dustinedwards/site-runtime/csp";
import { TURNSTILE_ORIGIN } from "@dustinedwards/site-runtime/turnstile";
import { PAGED_JS_CONFIG } from "./paged";
import { SECURITY_HEADERS } from "./header-set";
import { isPrivatePath } from "./site-meta";

/** Where browsers send violation reports (report-uri), and the Reporting API name for it (report-to). */
export const CSP_REPORT_PATH = "/csp-report";
const CSP_ENDPOINT = "csp-endpoint";
const SINK = { reportUri: CSP_REPORT_PATH, reportTo: CSP_ENDPOINT };

// What the pages load beyond 'self', read from the code (2026-10-30):
// - style, font: nothing. Inter is bundled (app/app.css); the serif faces and PDF.js (its module, worker, wasm,
//   fonts, cmaps) are self-hosted in public/.
// - img: 'self' (the favicon, /documents/<slug>/inline, the media library at /media/), and data: for the tiny
//   placeholder a library picture shows while it loads (site-api's, a base64 raster that Prelum and site-runtime check
//   before they write it; an image runs no script). Carrel's pages refuse any
//   picture outside the library (app/lib/carrel/render.server.ts), and every other stored HTML field is sanitized to
//   em/sup/sub (app/lib/richtext.ts).
// - script: 'self' plus the render's nonce, which React Router puts on its inline hydration and streaming scripts
//   (app/entry.server.tsx). A stored page keeps it and the gateway gives each reader a fresh one (renewNonce).
// - script, frame: Cloudflare Turnstile on the sign-in form (app/routes/signin.tsx).
// - style attributes: React style={{...}} props (brand marks, the program grid), which a nonce
//   cannot cover.
// - The Cloudflare Web Analytics beacon, allowed like every family site. On workers.dev the edge injects
//   none; once txasm.org is on the zone, it does.
// Beside it, the same policy with Trusted Types and default-src 'none' as Report-Only (the registry stages both), so the
// reports name each sink a page hands a string to and each kind it loads that the policy does not name.
function contentSecurityPolicies(nonce: string | undefined) {
  const policy = {
    sources: {
      script: [TURNSTILE_ORIGIN],
      frame: [TURNSTILE_ORIGIN],
      img: ["data:"],
    },
    nonce,
    styleAttributesInline: true,
    cloudflareWebAnalytics: true,
    ...SINK,
  };
  return [buildContentSecurityPolicy(policy), buildStagedPolicy(policy, { trustedTypes: true, denyUnlisted: true })];
}

/**
 * The printable book's own policy (book preview): its Paged.js config script by hash, the self-hosted Paged.js, and
 * inline styles, which the book's print stylesheet is and which Paged.js writes as it paginates.
 */
export async function bookPolicy(): Promise<Record<string, string>> {
  const { name, value } = buildContentSecurityPolicy({
    scriptHashes: [await scriptHash(PAGED_JS_CONFIG)],
    sources: { style: ["'unsafe-inline'"] },
    ...SINK,
  });
  return { [name]: value };
}

// A route's own value wins (the image document CSP and nosniff), so the set is
// applied without overwriting, and the page policy is added only when the route
// declared none. Headers can be immutable on some responses, so the response is
// rebuilt around a fresh copy. `nonce` is the one the page was rendered with.
// Signed-in, admin and API paths (robots.txt's Disallow list) also get X-Robots-Tag: noindex,
// which covers their resource routes and redirects, where no meta tag can go.
export function withSecurityHeaders(response: Response, request: Request, nonce?: string): Response {
  const headers = new Headers(response.headers);
  applyHeaderSet(headers, SECURITY_HEADERS, { overwrite: false });
  if (!headers.has("Content-Security-Policy") && !headers.has("Content-Security-Policy-Report-Only")) {
    for (const csp of contentSecurityPolicies(nonce)) headers.set(csp.name, csp.value);
  }
  // reportingEndpoints refuses a plain-http origin off loopback (the http request the https redirect answers), which a
  // browser would ignore anyway, so that answer gets none.
  const report = new URL(CSP_REPORT_PATH, request.url);
  if (report.protocol === "https:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(report.hostname)) {
    headers.set("Reporting-Endpoints", reportingEndpoints(CSP_ENDPOINT, report));
  }
  if (isPrivatePath(new URL(request.url).pathname)) headers.set("X-Robots-Tag", "noindex");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
