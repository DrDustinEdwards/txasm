import { test } from "node:test";
import assert from "node:assert/strict";
import { newCspNonce, withSecurityHeaders } from "../app/lib/security-headers";

const NONCE = newCspNonce();

// A page gets the Report-Only policy with its render's nonce and an absolute report
// endpoint; a route that set its own policy (the image document CSP) keeps it alone.
test("pages carry the report-only policy; a route's own policy wins", () => {
  const request = new Request("https://txasm.example.com/meetings");
  const page = withSecurityHeaders(new Response("<p>hi</p>"), request, NONCE);
  const policy = page.headers.get("Content-Security-Policy-Report-Only") ?? "";
  assert.ok(policy.includes(`'nonce-${NONCE}'`));
  assert.match(policy, /report-uri \/csp-report/);
  assert.match(policy, /report-to csp-endpoint/);
  assert.equal(page.headers.get("Reporting-Endpoints"), 'csp-endpoint="https://txasm.example.com/csp-report"');

  const image = withSecurityHeaders(
    new Response("", { headers: { "Content-Security-Policy": "default-src 'none'" } }),
    request,
  );
  assert.equal(image.headers.get("Content-Security-Policy"), "default-src 'none'");
  assert.equal(image.headers.get("Content-Security-Policy-Report-Only"), null);
});
