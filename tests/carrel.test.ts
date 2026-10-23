import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { createSiteApi } from "@dustinedwards/site-api";
import { runConformance } from "@dustinedwards/site-api/conformance";
import { createCarrelAdapter } from "../app/lib/carrel/adapter.server";
import { applyMigrations } from "./d1";

// Carrel's site API against real D1 with the real migrations, so the pages it
// edits are the seeded ones: site-api's own conformance suite, and the one rule
// that matters for a live route: a draft never reaches the page, a publish does,
// and each write leaves its audit row.
const KEY = "k".repeat(40);
const BASE = "https://txasm.example.com";
let mf: Miniflare;
let db: D1Database;
let api: ReturnType<typeof createSiteApi>;

const call = (path: string, init: RequestInit = {}) =>
  api.handle(
    new Request(BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...init.headers },
    }),
  );
const json = async (r: Response) => (await r.json()) as Record<string, any>;

before(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  await applyMigrations(db);
  const env = { DB: db, BETTER_AUTH_URL: BASE } as unknown as Env;
  api = createSiteApi({
    adapter: createCarrelAdapter(env),
    key: KEY,
    limiter: { limit: async () => ({ success: true }) },
    log: () => {},
  });
});

after(async () => {
  await mf.dispose();
});

test("passes site-api's own conformance suite", async () => {
  const report = await runConformance({
    baseUrl: BASE,
    key: KEY,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => api.handle(new Request(input as string, init))) as typeof fetch,
  });
  assert.deepEqual(report.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`), []);
});

test("a draft stays off the live page, a publish puts it there, and each write is audited", async () => {
  const live = () => db.prepare("SELECT title, html FROM page WHERE slug = 'award-nominations'").first<{ title: string; html: string }>();
  const before = await live();
  const doc = await json(await call("/api/carrel/v1/content/award-nominations"));
  const source = (doc.source as string).replace("Deadline: August 1", "Deadline: July 15");

  const saved = await json(await call("/api/carrel/v1/content/award-nominations/draft", {
    method: "PUT",
    body: JSON.stringify({ source, expectedVersion: doc.version, changeId: "chg_save" }),
  }));
  assert.deepEqual(await live(), before);

  const published = await call("/api/carrel/v1/content/award-nominations/publish", {
    method: "POST",
    body: JSON.stringify({ expectedVersion: saved.version, changeId: "chg_publish" }),
  });
  assert.equal(published.status, 200);
  assert.match((await live())!.html, /Deadline: July 15/);

  const audit = await db.prepare("SELECT event, change_id FROM page_revision ORDER BY created_at, rowid").all();
  assert.deepEqual(audit.results, [
    { event: "save", change_id: "chg_save" },
    { event: "publish", change_id: "chg_publish" },
  ]);

  const unpublish = await call("/api/carrel/v1/content/award-nominations/unpublish", {
    method: "POST",
    body: JSON.stringify({ expectedVersion: (await json(published)).version, changeId: "chg_down" }),
  });
  assert.equal(unpublish.status, 422);
});
