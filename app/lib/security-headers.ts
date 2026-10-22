// The security headers every response from this Worker carries: the family standard
// from @dustinedwards/site-runtime, with no overrides. X-Frame-Options: deny is the
// part that matters most here: a framed admin page could otherwise submit a role
// grant or a book publish with the chair's cookie (Grok audit 2026-10-21, TX-1).
import { applyHeaderSet, buildSecurityHeaders } from "@dustinedwards/site-runtime/headers";

const SECURITY_HEADERS = buildSecurityHeaders();

// A route's own value wins (the image document CSP and nosniff), so the set is
// applied without overwriting. Headers can be immutable on some responses, so the
// response is rebuilt around a fresh copy.
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  applyHeaderSet(headers, SECURITY_HEADERS, { overwrite: false });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
