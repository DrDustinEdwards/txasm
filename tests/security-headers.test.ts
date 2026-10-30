import { test } from "node:test";
import assert from "node:assert/strict";
import { scriptHash } from "@dustinedwards/site-runtime/csp";
import { inlineScriptHashes, newCspNonce, withSecurityHeaders } from "../app/lib/security-headers";

const NONCE = newCspNonce();

// A page gets the Report-Only policy with its render's nonce and an absolute report
// endpoint; a route that set its own policy (the image document CSP) keeps it alone.
test("pages carry the report-only policy; a route's own policy wins", () => {
  const request = new Request("https://txasm.example.com/meetings");
  const page = withSecurityHeaders(new Response("<p>hi</p>"), request, { nonce: NONCE });
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

// A page the edge stores has no nonce, so its policy must name every inline script it runs, by hash, and nothing for a
// script loaded by src. A missed script is blocked once the policy enforces; an extra one widens it.
test("an edge-stored page's inline scripts are trusted by hash", async () => {
  const html =
    '<script type="module" src="/assets/entry.js"></script><script>window.__ctx = {"a":"<\\/script>"};</script>' +
    '<script type="module">import "/assets/root.js";</script><script>window.__ctx = {"a":"<\\/script>"};</script>';
  const hashes = await inlineScriptHashes(html);
  assert.deepEqual(hashes, [
    await scriptHash('window.__ctx = {"a":"<\\/script>"};'),
    await scriptHash('import "/assets/root.js";'),
  ]);
  const page = withSecurityHeaders(new Response(html), new Request("https://txasm.example.com/"), { scriptHashes: hashes });
  const policy = page.headers.get("Content-Security-Policy-Report-Only") ?? "";
  assert.ok(hashes.every((hash) => policy.includes(`'${hash}'`)));
  assert.ok(!policy.includes("'nonce-"));
});
