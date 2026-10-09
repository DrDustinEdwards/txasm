import { readFileSync, readdirSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import {
  dumpDatabase,
  runRestoreDrill,
  type D1Like,
  type R2Like,
} from "@dustinedwards/d1-dump";
import {
  EXCLUDED_TABLES,
  getBackupHealth,
  runNightlyBackup,
} from "../app/lib/backup.server";

// Real D1 and R2 in-process, with the real migrations applied, so the table list
// is the site's own: a new migration that adds a token table fails the credential
// scan below until the table is excluded.
let mf: Miniflare;
let db: D1Like;
let scratchDb: D1Like;
let bucket: R2Like;
let env: { DB: D1Like; BOOKS: R2Like };

const migrationsDir = new URL("../drizzle/", import.meta.url);

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
  env = { DB: db, BOOKS: bucket };

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(new URL(file, migrationsDir), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }

  await db
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Ada', 'ada@example.org', 1, 1, 1)",
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
  assert.ok(
    !text.includes("MAGIC-LINK-TOKEN-ABC"),
    "a verification token must not reach the dump",
  );
  const listed = await bucket.list({ prefix: "backups/" });
  for (const table of EXCLUDED_TABLES) {
    assert.ok(
      !listed.objects.some((o) => o.key.endsWith(`/${table}.json`)),
      `${table} must not be dumped`,
    );
  }
});

test("no table outside the excluded list has a credential-looking column", async () => {
  const tables = (
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'",
      )
      .all<{ name: string }>()
  ).results.map((r) => r.name);
  const offenders: string[] = [];
  for (const table of tables) {
    if ((EXCLUDED_TABLES as readonly string[]).includes(table)) continue;
    const cols = (
      await db.prepare(`PRAGMA table_info(\`${table}\`)`).all<{ name: string }>()
    ).results;
    for (const col of cols) {
      if (/token|secret|password|passwd|api_?key/i.test(col.name)) {
        offenders.push(`${table}.${col.name}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "exclude these tables or rename the columns");
});

test("the restore drill passes on a dump without the credential tables", async () => {
  const result = await runRestoreDrill(bucket, {
    createScratch: async () => ({
      db: scratchDb,
      delete: async () => {},
    }),
  });
  // txasm has no FTS5 table, and the drill's `search` check fails when no FTS5
  // table held a word to search for. That is d1-dump's rule, not a restore
  // problem, so every other check must pass and `search` must fail for that
  // reason only.
  const failed = result.checks.filter((c) => !c.ok);
  assert.deepEqual(
    failed.map((c) => c.name),
    ["search"],
    failed.map((c) => `${c.name}: ${c.detail}`).join("; "),
  );
  assert.match(failed[0].detail, /no FTS5 table/);
});

test("an empty bucket reports a warning, not an age", async () => {
  const emptyMf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    r2Buckets: ["EMPTY"],
  });
  try {
    const bare = (await emptyMf.getR2Bucket("EMPTY")) as unknown as R2Like;
    const health = await getBackupHealth({ BOOKS: bare } as never);
    assert.ok(health.warning, "no dump must warn");
    assert.notEqual(health.age_hours, 0);
  } finally {
    await emptyMf.dispose();
  }
});

test("a dump older than 26 hours warns", async () => {
  const old = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
    r2Buckets: ["OLD"],
  });
  try {
    const oldDb = (await old.getD1Database("DB")) as unknown as D1Like;
    await oldDb.prepare("CREATE TABLE t (id INTEGER PRIMARY KEY)").run();
    await oldDb.prepare("INSERT INTO t (id) VALUES (1)").run();
    const oldBucket = (await old.getR2Bucket("OLD")) as unknown as R2Like;
    await dumpDatabase(oldDb, oldBucket, {
      now: new Date(Date.now() - 30 * 3600 * 1000),
    });
    const health = await getBackupHealth({ BOOKS: oldBucket } as never);
    assert.ok(health.warning, "a 30 hour old dump must warn");
    assert.ok((health.age_hours ?? 0) >= 29);
  } finally {
    await old.dispose();
  }
});
