import { readFileSync, readdirSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import {
  ForbiddenError,
  ValidationError,
  getDataAccess,
  type Actor,
} from "../app/lib/data-access";

// The data-access layer is the security boundary (CLAUDE.md hard rule 1), so its
// refusals are tested against real D1 with the real migrations: a chair of one
// meeting is refused on another, and a sponsor link that is not http or https is
// refused, since the public program puts it in an href (Grok audit 2026-10-21,
// TX-2 and TX-8).
let mf: Miniflare;
let dataAccess: ReturnType<typeof getDataAccess>;

const chairOfA: Actor = {
  userId: "u-chair",
  grants: [{ role: "chair", editionId: "ed-a" }],
} as Actor;

before(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  const migrationsDir = new URL("../drizzle/", import.meta.url);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(new URL(file, migrationsDir), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }
  for (const [id, slug, season] of [["ed-a", "spring-2026", "spring"], ["ed-b", "fall-2026", "fall"]]) {
    await db
      .prepare(
        "INSERT INTO edition (id, slug, name, season, year, created_at, updated_at) VALUES (?, ?, 'Sample meeting', ?, 2026, 1, 1)",
      )
      .bind(id, slug, season)
      .run();
  }
  dataAccess = getDataAccess({ DB: db } as unknown as Env);
});

after(async () => {
  await mf.dispose();
});

test("a chair of one meeting cannot add a sponsor to another", async () => {
  await assert.rejects(
    dataAccess.sponsors.create(chairOfA, { editionId: "ed-b", name: "Sample Lab" }),
    ForbiddenError,
  );
});

test("a sponsor link must be http or https", async () => {
  await assert.rejects(
    dataAccess.sponsors.create(chairOfA, {
      editionId: "ed-a",
      name: "Sample Lab",
      url: "javascript:alert(1)",
    }),
    ValidationError,
  );
  const sponsor = await dataAccess.sponsors.create(chairOfA, {
    editionId: "ed-a",
    name: "Sample Lab",
    url: "https://example.com",
  });
  await assert.rejects(
    dataAccess.sponsors.update(chairOfA, sponsor.id, { url: " data:text/html,x" }),
    ValidationError,
  );
});
