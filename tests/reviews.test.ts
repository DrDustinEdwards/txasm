import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { type Actor, getDataAccess } from "../app/lib/data-access";
import { applyMigrations } from "./d1";

// A review and its scores are one write: a rubric with more criteria than D1 binds in one
// insert still saves, and a failure part way leaves no review behind.
let mf: Miniflare;
let d1: D1Database;
let dataAccess: ReturnType<typeof getDataAccess>;

const CRITERIA = 40;
const reviewer: Actor = { userId: "u-reviewer", grants: [] } as Actor;
const criterionIds = Array.from({ length: CRITERIA }, (_, i) => `c-${i}`);

before(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  d1 = db as unknown as D1Database;
  await applyMigrations(db);
  await db.batch([
    db.prepare(
      "INSERT INTO user (id, email, created_at, updated_at) VALUES ('u-reviewer', 'reviewer@example.com', 1, 1)",
    ),
    db.prepare(
      "INSERT INTO edition (id, slug, name, season, year, status, created_at, updated_at) VALUES ('ed-a', 'spring-2026', 'Sample meeting', 'spring', 2026, 'scheduled', 1, 1)",
    ),
    db.prepare(
      "INSERT INTO abstract (id, edition_id, submitter_id, title, status, created_at, updated_at) VALUES ('a-0', 'ed-a', 'u-reviewer', 'Sample abstract', 'accepted', 1, 1)",
    ),
    db.prepare(
      "INSERT INTO review_assignment (id, edition_id, abstract_id, reviewer_id, assigned_at, created_at) VALUES ('as-0', 'ed-a', 'a-0', 'u-reviewer', 1, 1)",
    ),
    ...criterionIds.map((id) =>
      db
        .prepare(
          "INSERT INTO rubric_criterion (id, edition_id, label, created_at) VALUES (?, 'ed-a', 'Sample criterion', 1)",
        )
        .bind(id),
    ),
  ]);
  dataAccess = getDataAccess({ DB: db } as unknown as Env);
});

after(async () => {
  await mf.dispose();
});

const count = async (table: string) =>
  (await d1.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

test("a review with more scores than one insert can bind saves whole", async () => {
  const submission = {
    assignmentId: "as-0",
    recommendation: "accept" as const,
    scores: criterionIds.map((criterionId) => ({ criterionId, score: 3 })),
  };
  await dataAccess.reviews.submit(reviewer, submission);
  assert.equal(await count("review"), 1);
  assert.equal(await count("review_score"), CRITERIA);
  await dataAccess.reviews.submit(reviewer, { ...submission, recommendation: "revise" });
  assert.equal(await count("review"), 1);
  assert.equal(await count("review_score"), CRITERIA);
});

test("a submit that fails on its scores leaves no review without them", async () => {
  await d1.batch([
    d1.prepare("DELETE FROM review"),
    d1.prepare("UPDATE review_assignment SET status = 'assigned'"),
  ]);
  await assert.rejects(
    dataAccess.reviews.submit(reviewer, {
      assignmentId: "as-0",
      recommendation: "accept",
      scores: [
        { criterionId: "c-0", score: 3 },
        { criterionId: "c-0", score: 4 },
      ],
    }),
  );
  assert.equal(await count("review"), 0);
  assert.equal(await count("review_score"), 0);
  const assignment = await d1
    .prepare("SELECT status FROM review_assignment")
    .first<{ status: string }>();
  assert.equal(assignment?.status, "assigned");
});
