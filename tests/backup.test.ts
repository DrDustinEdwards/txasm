import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { backupHealth, runRestoreDrill, type D1Like, type R2Like } from "@dustinedwards/d1-dump";
import { cronCheck, runJobs } from "@dustinedwards/site-runtime/cron";
import { recordNotFound } from "@dustinedwards/site-runtime/not-found";
import { runNightlyBackup } from "../app/lib/backup.server";
import { EXCLUDED_TABLES } from "../app/lib/backup-checks";
import { applyMigrations } from "./d1";

// Real D1 and R2 in-process, with the real migrations applied, so the table list
// is the site's own: a new migration that adds a token table fails the nightly
// dump (d1-dump's credential-column check) until the table is excluded.
let mf: Miniflare;
let db: D1Like;
let scratchDb: D1Like;
let bucket: R2Like;
let env: Parameters<typeof runNightlyBackup>[0];

before(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB", "SCRATCH"],
    r2Buckets: ["BOOKS"],
  });
  db = (await mf.getD1Database("DB")) as unknown as D1Like;
  scratchDb = (await mf.getD1Database("SCRATCH")) as unknown as D1Like;
  bucket = (await mf.getR2Bucket("BOOKS")) as unknown as R2Like;
  env = { DB: db, BOOKS: bucket } as unknown as typeof env;

  await applyMigrations(db);

  await db
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Ada', 'ada@example.org', 1, 1, 1)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO platform_settings (id, org_name, created_at, updated_at) VALUES ('default', 'TXASM', 1, 1)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES ('v1', 'ada@example.org', 'MAGIC-LINK-TOKEN-ABC', 9999999999999, 1, 1)",
    )
    .run();
});

after(async () => {
  await mf.dispose();
});

async function allObjectText(): Promise<string> {
  const listed = await bucket.list({ prefix: "backups/" });
  let text = "";
  for (const object of listed.objects) {
    text += (await (await bucket.get(object.key))?.text()) ?? "";
  }
  return text;
}

test("the nightly dump keeps user rows and drops every credential table", async () => {
  await runNightlyBackup(env);
  const text = await allObjectText();
  assert.ok(text.includes("ada@example.org"), "user rows must be in the dump");
  assert.ok(!text.includes("MAGIC-LINK-TOKEN-ABC"), "a verification token must not reach the dump");
  const listed = await bucket.list({ prefix: "backups/" });
  for (const table of EXCLUDED_TABLES) {
    assert.ok(
      !listed.objects.some((o) => o.key.endsWith(`/${table}.json`)),
      `${table} must not be dumped`,
    );
  }
});

test("the restore drill passes on a dump without the credential tables", async () => {
  const result = await runRestoreDrill(bucket, {
    createScratch: async () => ({
      db: scratchDb,
      delete: async () => {},
    }),
  });
  // txasm has no FTS5 table, which the drill's `search` check passes since d1-dump 0.7.1.
  const failed = result.checks.filter((c) => !c.ok);
  assert.deepEqual(
    failed.map((c) => `${c.name}: ${c.detail}`),
    [],
  );
});

test("an emptied database never gets the complete marker", async () => {
  const before = await backupHealth(env.BOOKS);
  await db.prepare("DELETE FROM platform_settings").run();
  try {
    await assert.rejects(runNightlyBackup(env), /left incomplete.*platform_settings dumped empty/);
  } finally {
    await db
      .prepare(
        "INSERT INTO platform_settings (id, org_name, created_at, updated_at) VALUES ('default', 'TXASM', 1, 1)",
      )
      .run();
  }
  const after = await backupHealth(env.BOOKS);
  assert.equal(after.last_ok, before.last_ok, "the failed run must not become the latest");
});

// Migrations 0024 and 0025 bring the site's tables to site-runtime's shapes: its 404 upsert needs the
// (day, path, referrer_host) key, and runJobs and cronCheck read and write cron_runs.
test("the migrated tables take the 404 count per referrer and the cron record", async () => {
  const url = new URL("https://example.com/gone?token=secret");
  await recordNotFound(db, url, undefined, "https://a.example.com/page");
  await recordNotFound(db, url, undefined, "https://a.example.com/other");
  await recordNotFound(db, url, undefined, null);
  const rows = (
    await db
      .prepare("SELECT path, referrer_host, hit_count FROM page_404_daily ORDER BY referrer_host")
      .all()
  ).results;
  assert.deepEqual(rows, [
    { path: "/gone", referrer_host: "", hit_count: 1 },
    { path: "/gone", referrer_host: "a.example.com", hit_count: 2 },
  ]);

  await runJobs(db, [{ name: "noop", everyMinutes: 1440, run: async () => {} }]);
  assert.equal(await cronCheck(db).run(), true);
});
