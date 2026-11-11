// The printable books enforce Trusted Types through site-runtime's Paged.js policy, which passes Paged.js 0.4.3's page
// frame and nothing else. A new polyfill whose frame differs would stop every book at its first page, with nothing to
// say why, so the self-hosted file must still contain the frame the policy names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAGED_JS_PAGE_TEMPLATE } from "@dustinedwards/site-runtime/print-pdf";
import { PAGED_JS_PATH } from "../app/lib/paged";

test("the self-hosted Paged.js writes the page frame the Trusted Types policy passes", () => {
  const polyfill = readFileSync(new URL(`../public${PAGED_JS_PATH}`, import.meta.url), "utf8");
  assert.ok(polyfill.includes(`const TEMPLATE = \`${PAGED_JS_PAGE_TEMPLATE}\`;`));
});
