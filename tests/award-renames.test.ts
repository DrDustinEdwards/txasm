import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { renameRedirect } from "@dustinedwards/site-runtime/url";
import { getDataAccess, type Actor } from "../app/lib/data-access";
import { applyMigrations } from "./d1";

// A renamed award keeps its old address: /awards/<old slug> answers one permanent redirect to the slug it has now,
// through two renames, and a slug taken back is live again, not a redirect (award_slug_redirect, migration 0031).
let mf: Miniflare;
let dataAccess: ReturnType<typeof getDataAccess>;
const admin: Actor = { userId: "u-admin", grants: [{ role: "admin", editionId: null }] } as Actor;

before(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok') } }", d1Databases: ["DB"] });
  const db = await mf.getD1Database("DB");
  await applyMigrations(db);
  dataAccess = getDataAccess({ DB: db } as unknown as Env);
});

after(() => mf.dispose());

const moved = (path: string) =>
  renameRedirect(new Request(`https://txasm.org${path}`), { prefix: "/awards/", renames: (slug) => dataAccess.awards.renamedSlug(slug) });

test("an award renamed twice redirects from both old slugs in one hop, and a slug taken back is live", async () => {
  const award = await dataAccess.awards.create(admin, { name: "Sample award", slug: "first-name", namesakeBio: "", description: "", sortOrder: 0 });
  await dataAccess.awards.update(admin, award!.id, { slug: "second-name" });
  await dataAccess.awards.update(admin, award!.id, { slug: "third-name" });
  for (const old of ["first-name", "second-name"]) {
    const res = await moved(`/awards/${old}?year=2026`);
    assert.equal(res?.status, 301);
    assert.equal(res?.headers.get("Location"), "https://txasm.org/awards/third-name?year=2026");
  }
  assert.equal(await moved("/awards/third-name"), null);
  await dataAccess.awards.update(admin, award!.id, { slug: "first-name" });
  assert.equal(await moved("/awards/first-name"), null);
  assert.equal((await moved("/awards/third-name"))?.headers.get("Location"), "https://txasm.org/awards/first-name");
});
