import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

// wrangler.jsonc allows comments, which TypeScript's JSON parser tolerates.
const raw = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", raw);
assert.equal(parsed.error, undefined, "wrangler.jsonc must parse");
const config = parsed.config as {
  compatibility_flags?: string[];
  observability?: {
    enabled?: boolean;
    logs?: { enabled?: boolean; head_sampling_rate?: number };
    traces?: { enabled?: boolean; head_sampling_rate?: number };
  };
};

test("nodejs_compat is on", () => {
  assert.ok(config.compatibility_flags?.includes("nodejs_compat"));
});

test("observability has logs and traces with a stated sampling rate", () => {
  const o = config.observability;
  assert.equal(o?.enabled, true);
  assert.equal(o?.logs?.enabled, true);
  assert.equal(typeof o?.logs?.head_sampling_rate, "number");
  assert.equal(o?.traces?.enabled, true);
  assert.equal(typeof o?.traces?.head_sampling_rate, "number");
});
