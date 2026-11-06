import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The data-access boundary (CLAUDE.md hard rule 1, oxlint.config.ts): D1 has no row-level security, so a route that
// imports the schema or a Drizzle client skips every authorization check, and data it leaks cannot be taken back.
// This runs the repository's own Oxlint config over a module outside the boundary that reaches past it in each of
// the three ways, and over the boundary itself, which may.
const ROOT = join(import.meta.dirname, "..");

/** The restricted-import findings for one file, by the help message the config gives each pattern. */
function restricted(file: string): string[] {
  const run = spawnSync(process.execPath, [join(ROOT, "node_modules", "oxlint", "bin", "oxlint"), "-f", "json", file], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  const report = JSON.parse(run.stdout) as { diagnostics: Array<{ code: string; help?: string }> };
  return report.diagnostics.filter((d) => d.code === "eslint(no-restricted-imports)").map((d) => d.help ?? "");
}

test("an import of the schema or a Drizzle client from outside the data-access layer fails lint", () => {
  // In app/lib, where the rule applies; a file name no route or module uses.
  const fixture = join("app", "lib", `boundary-fixture-${process.pid}.ts`);
  writeFileSync(
    join(ROOT, fixture),
    [
      'export * as schema from "../db/schema";',
      'export { getDb } from "../db/index.server";',
      'export { drizzle } from "drizzle-orm/d1";',
      "",
    ].join("\n"),
  );
  try {
    const found = restricted(fixture);
    assert.equal(found.length, 3, found.join("\n"));
    for (const message of [
      /^Do not import the Drizzle schema directly/,
      /^Do not import the Drizzle client factory directly/,
      /^Do not construct a Drizzle client outside the data-access layer/,
    ]) {
      assert.ok(found.some((help) => message.test(help)), `${message} not among:\n${found.join("\n")}`);
    }
  } finally {
    rmSync(join(ROOT, fixture), { force: true });
  }

  assert.deepEqual(restricted(join("app", "lib", "data-access.ts")), []);
});
