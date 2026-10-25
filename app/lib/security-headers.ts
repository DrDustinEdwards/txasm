// The security headers every response from this Worker carries: the family standard
// from @dustinedwards/site-runtime, with one override, the passkey sign-in's
// Permissions-Policy (PASSKEY_OVERRIDES). X-Frame-Options: deny is the
// part that matters most here: a framed admin page could otherwise submit a role
// grant or a book publish with the chair's cookie (Grok audit 2026-10-21, TX-1).
import { TDM_RESERVATION_HEADERS } from "@drdustinedwards/site-helpers/robots";
import { PASSKEY_OVERRIDES, applyHeaderSet, buildSecurityHeaders } from "@dustinedwards/site-runtime/headers";
import { buildContentSecurityPolicy, generateNonce, reportingEndpoints } from "@dustinedwards/site-runtime/csp";
import { TURNSTILE_ORIGIN } from "@dustinedwards/site-runtime/turnstile";

// The house set plus Prelum's TDMRep header, which reserves training rights as /ai.txt says.
export const SECURITY_HEADERS = {
  ...buildSecurityHeaders({ overrides: PASSKEY_OVERRIDES }),
  ...TDM_RESERVATION_HEADERS,
};

/** Where browsers send violation reports (report-uri), and the Reporting API name for it (report-to). */
export const CSP_REPORT_PATH = "/csp-report";
const CSP_ENDPOINT = "csp-endpoint";

/** A fresh nonce for one page render. Pages are never shared-cached, so a per-request nonce is safe. */
export const newCspNonce = generateNonce;

// What the pages load beyond 'self', read from the code (2026-10-24):
// - style, font: Google Fonts, the Inter stylesheet in app/root.tsx and the files it names.
//   The serif faces and PDF.js (its module, worker, wasm, fonts, cmaps) are self-hosted in public/.
// - img: only 'self' (the favicon, /documents/<slug>/inline).
// - script: 'self' plus this request's nonce, which React Router puts on its inline hydration and
//   streaming scripts (app/entry.server.tsx).
// - script, frame: Cloudflare Turnstile on the sign-in form (app/routes/signin.tsx).
// - style attributes: React style={{...}} props (brand marks, the program grid), which a nonce
//   cannot cover.
// Not listed, so reported: the book preview's Paged.js (unpkg) and its inline styles and config
// script (app/lib/paged.ts), and any external image in D1 content. No Cloudflare Web Analytics
// beacon: the site is on workers.dev, where the edge injects none.
// Report-Only until the reports show nothing the pages need is missing.
function contentSecurityPolicy(nonce: string | undefined) {
  return buildContentSecurityPolicy({
    sources: {
      style: ["https://fonts.googleapis.com"],
      font: ["https://fonts.gstatic.com"],
      script: [TURNSTILE_ORIGIN],
      frame: [TURNSTILE_ORIGIN],
    },
    nonce,
    styleAttributesInline: true,
    reportUri: CSP_REPORT_PATH,
    reportTo: CSP_ENDPOINT,
    reportOnly: true,
  });
}

// A route's own value wins (the image document CSP and nosniff), so the set is
// applied without overwriting, and the page policy is added only when the route
// declared none. Headers can be immutable on some responses, so the response is
// rebuilt around a fresh copy. `nonce` is the one the page was rendered with.
export function withSecurityHeaders(response: Response, request: Request, nonce?: string): Response {
  const headers = new Headers(response.headers);
  applyHeaderSet(headers, SECURITY_HEADERS, { overwrite: false });
  if (!headers.has("Content-Security-Policy") && !headers.has("Content-Security-Policy-Report-Only")) {
    const csp = contentSecurityPolicy(nonce);
    headers.set(csp.name, csp.value);
  }
  headers.set("Reporting-Endpoints", reportingEndpoints(CSP_ENDPOINT, new URL(CSP_REPORT_PATH, request.url)));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
