import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { createSiteApi } from "@dustinedwards/site-api";
import { runConformance } from "@dustinedwards/site-api/conformance";
import { createCarrelAdapter } from "../app/lib/carrel/adapter.server";
import { applyMigrations } from "./d1";

// Carrel's site API against real D1 and R2 with the real migrations, so the pages it
// edits are the seeded ones: site-api's own conformance suite (with its media upload
// round trip), the one rule that matters for a live route (a draft never reaches the
// page, a publish does, and each write leaves its audit row), and the media library's
// behaviors. Images and Workers AI have no local emulation, so both are recorded shapes.
const KEY = "k".repeat(40);
const BASE = "https://txasm.example.com";
let mf: Miniflare;
let db: D1Database;
let uploads: R2Bucket;
let api: ReturnType<typeof createSiteApi>;

const call = (path: string, init: RequestInit = {}) =>
  api.handle(
    new Request(BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...init.headers },
    }),
  );
const json = async (r: Response) => (await r.json()) as Record<string, any>;
const PREFIX = "/api/carrel/v1";

type Size = { width: number; height: number };

/** A PNG's signature and IHDR (the size the fake binding reads), a tEXt chunk per field, and IEND. Not decodable, never decoded. */
function png({ width, height }: Size, text: Record<string, string> = {}): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...Object.entries(text).map(([k, v]) => chunk("tEXt", new TextEncoder().encode(`${k}\u0000${v}`))),
    chunk("IEND", new Uint8Array()),
  ];
  return new Uint8Array(parts.flatMap((p) => [...p]));
}

/**
 * An IMAGES binding that measures a PNG by its IHDR, and "transforms" by appending what it was asked to do, so the
 * output differs from the input and is measured as the steps say (a quarter turn swaps the edges, a maxEdge fits them).
 */
const MARK = "|steps:";
/** The bytes before the mark and the steps after it (latin1: one character per byte). */
function stepsOf(bytes: Uint8Array): { base: Uint8Array; steps: unknown[] } {
  const at = new TextDecoder("latin1").decode(bytes).lastIndexOf(MARK);
  if (at === -1) return { base: bytes, steps: [] };
  return { base: bytes.subarray(0, at), steps: JSON.parse(new TextDecoder().decode(bytes.subarray(at + MARK.length))) as unknown[] };
}
const fakeImages = {
  async info(stream: ReadableStream) {
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    const view = new DataView(bytes.buffer);
    let size = { width: view.getUint32(16), height: view.getUint32(20) };
    const steps = stepsOf(bytes).steps as Array<{ rotate?: number; width?: number }>;
    for (const step of steps) {
      if (step.rotate === 90 || step.rotate === 270) size = { width: size.height, height: size.width };
      if (step.width) {
        const scale = Math.min(1, step.width / Math.max(size.width, size.height));
        size = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
      }
    }
    return { ...size, format: "image/png", fileSize: bytes.length };
  },
  input(stream: ReadableStream) {
    const steps: unknown[] = [];
    const handle = {
      transform(step: unknown) {
        steps.push(step);
        return handle;
      },
      async output() {
        const { base, steps: earlier } = stepsOf(new Uint8Array(await new Response(stream).arrayBuffer()));
        const marked = new Uint8Array([...base, ...new TextEncoder().encode(`${MARK}${JSON.stringify([...earlier, ...steps])}`)]);
        return { response: () => new Response(marked) };
      },
    };
    return handle;
  },
};

const fakeAi = {
  run: async () => ({ response: 'Sure: {"alt": "A poster session in a hotel ballroom.", "tags": ["Posters", "ballroom", "ballroom"]}' }),
};

async function upload(bytes: Uint8Array, name: string, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({ filename: name, changeId: `chg_${name.replace(/[^A-Za-z0-9_-]/g, "_")}`, ...extra });
  return call(`${PREFIX}/media?${query}`, { method: "POST", body: bytes, headers: { "Content-Type": "image/png" } });
}
const enc = encodeURIComponent;
const objectBytes = async (key: string) => new Uint8Array(await (await uploads.get(key))!.arrayBuffer());

before(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
    r2Buckets: ["UPLOADS"],
  });
  db = await mf.getD1Database("DB");
  uploads = (await mf.getR2Bucket("UPLOADS")) as unknown as R2Bucket;
  await applyMigrations(db);
  const env = { DB: db, UPLOADS: uploads, IMAGES: fakeImages, AI: fakeAi, BETTER_AUTH_URL: BASE } as unknown as Env;
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
    probeMediaUpload: true,
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

test("a library picture: a page publishes it with its sizes, and while a page uses it the file stays", async () => {
  const uploaded = await upload(png({ width: 1600, height: 900 }, { Author: "Example Photographer" }), "Poster Hall.png", { alt: "Posters" });
  assert.equal(uploaded.status, 201);
  const file = await json(uploaded);
  assert.match(file.id, /^media\/\d{4}\/[0-9a-f]{10}-poster-hall\.png$/);
  assert.equal(file.url, `/${file.id}`);
  // Filled from the PNG's own text, and said so.
  assert.deepEqual([file.credit, file.embedded], ["Example Photographer", ["credit"]]);

  // A picture from outside the library is refused, so a page never hotlinks.
  const doc = await json(await call(`${PREFIX}/content/home`));
  const outside = await call(`${PREFIX}/content/home/publish`, {
    method: "POST",
    body: JSON.stringify({ source: `${doc.source}\n![A poster](https://example.com/poster.png)\n`, expectedVersion: doc.version, changeId: "chg_outside" }),
  });
  assert.equal(outside.status, 422);

  const published = await call(`${PREFIX}/content/home/publish`, {
    method: "POST",
    body: JSON.stringify({ source: `${doc.source}\n![Posters in the hall](${file.url})\n`, expectedVersion: doc.version, changeId: "chg_picture" }),
  });
  assert.equal(published.status, 200);
  const { html } = (await db.prepare("SELECT html FROM page WHERE slug = 'home'").first<{ html: string }>())!;
  assert.match(html, /<picture><source type="image\/avif" srcset="[^"]*\?w=768&#x26;f=avif 768w/);
  assert.match(html, /width="768" height="432"/);

  const detail = await json(await call(`${PREFIX}/media/${enc(file.id)}`));
  assert.deepEqual(detail.usedBy.map((u: { id: string; detail: string }) => [u.id, u.detail]), [["home", "the published page and its draft"]]);
  const refused = await call(`${PREFIX}/media/${enc(file.id)}?changeId=chg_delete`, { method: "DELETE" });
  assert.equal(refused.status, 422);
  assert.ok(await uploads.head(file.id));

  // Each write names the version it was loaded at: the second of two from one version is refused, not lost.
  const alt = (changeId: string) =>
    call(`${PREFIX}/media/${enc(file.id)}/alt`, { method: "PUT", body: JSON.stringify({ alt: changeId, expectedVersion: file.version, changeId }) });
  assert.equal((await alt("chg_alt_1")).status, 200);
  assert.equal((await alt("chg_alt_2")).status, 409);
  assert.equal((await json(await call(`${PREFIX}/media/${enc(file.id)}`))).alt, "chg_alt_1");
});

test("bytes the library already holds answer as that file, and nothing new is stored", async () => {
  const bytes = png({ width: 40, height: 40 }, { Seed: "twin" });
  const first = await json(await upload(bytes, "first.png"));
  const again = await upload(bytes, "renamed.png");
  assert.equal(again.status, 200);
  const answered = await json(again);
  assert.deepEqual([answered.id, answered.duplicateOf], [first.id, first.id]);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM media WHERE filename = 'renamed.png'").first<{ n: number }>())!.n, 0);
});

test("a turn keeps the old bytes in the history, a revert puts them back, and a turn that changes the size is a new file", async () => {
  const square = await json(await upload(png({ width: 50, height: 50 }, { Seed: "square" }), "square.png"));
  const original = await objectBytes(square.id);
  const flipped = await json(await call(`${PREFIX}/media/${enc(square.id)}/transform`, {
    method: "POST",
    body: JSON.stringify({ op: "flip-h", expectedVersion: square.version, changeId: "chg_flip" }),
  }));
  assert.equal(flipped.asNewFile, false, JSON.stringify(flipped));
  assert.notDeepEqual(await objectBytes(square.id), original);
  const { revisions } = await json(await call(`${PREFIX}/media/${enc(square.id)}/history`));
  assert.deepEqual(revisions.map((r: { reason: string; current: boolean }) => [r.reason, r.current]), [["transform", true], ["upload", false]]);
  const reverted = await call(`${PREFIX}/media/${enc(square.id)}/revert`, {
    method: "POST",
    body: JSON.stringify({ to: revisions[1].rev, expectedVersion: flipped.version, changeId: "chg_revert" }),
  });
  assert.equal(reverted.status, 200);
  assert.deepEqual(await objectBytes(square.id), original);

  const wide = await json(await upload(png({ width: 60, height: 30 }, { Seed: "wide" }), "wide.png", { alt: "A wide chart" }));
  const turned = await json(await call(`${PREFIX}/media/${enc(wide.id)}/transform`, {
    method: "POST",
    body: JSON.stringify({ op: "rotate-90", expectedVersion: wide.version, changeId: "chg_turn" }),
  }));
  assert.deepEqual([turned.asNewFile, turned.width, turned.height, turned.alt], [true, 30, 60, "A wide chart"]);
  assert.notEqual(turned.id, wide.id);
  assert.equal((await json(await call(`${PREFIX}/media/${enc(wide.id)}`))).version, wide.version);
});

test("a large picture is shrunk at upload unless asked not to, and its original is kept", async () => {
  const bytes = png({ width: 5000, height: 2500 }, { Seed: "large" });
  const shrunk = await json(await upload(bytes, "large.png"));
  assert.deepEqual([shrunk.width, shrunk.height, shrunk.resizedFrom], [2560, 1280, { width: 5000, height: 2500, bytes: bytes.length }]);
  const kept = (await uploads.list({ prefix: "media-history/" })).objects.find((o) => o.key.endsWith(`/${shrunk.id}`));
  assert.ok(kept, "the original was not kept");
  assert.deepEqual(await objectBytes(kept.key), bytes);

  const asIs = await json(await upload(png({ width: 5000, height: 2500 }, { Seed: "large-kept" }), "large-kept.png", { resize: "no" }));
  assert.deepEqual([asIs.width, asIs.height], [5000, 2500]);
});

test("the change log names each file changed since a cursor, and each one deleted for good", async () => {
  const { changeCursor } = await json(await call(`${PREFIX}/media?limit=1`));
  const file = await json(await upload(png({ width: 20, height: 20 }, { Seed: "changes" }), "changes.png"));
  const changed = await json(await call(`${PREFIX}/media?changedSince=${changeCursor}`));
  assert.ok(changed.items.some((i: { id: string }) => i.id === file.id));

  assert.equal((await call(`${PREFIX}/media/${enc(file.id)}?changeId=chg_gone`, { method: "DELETE" })).status, 200);
  const after = await json(await call(`${PREFIX}/media?changedSince=${changed.changeCursor}`));
  assert.deepEqual(after.removed, [file.id]);
  assert.equal(await uploads.head(file.id), null);
});

test("suggestions come from the model in the contract's spelling, and nothing is applied", async () => {
  const file = await json(await upload(png({ width: 30, height: 20 }, { Seed: "suggest" }), "suggest.png"));
  const suggested = await json(await call(`${PREFIX}/media/${enc(file.id)}/suggestions`));
  assert.deepEqual([suggested.alt, suggested.tags], ["A poster session in a hotel ballroom.", ["posters", "ballroom"]]);
  assert.deepEqual((await json(await call(`${PREFIX}/media/${enc(file.id)}`))).alt, "");
});
