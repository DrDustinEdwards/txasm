import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import {
  type Actor,
  ConflictOfInterestError,
  ForbiddenError,
  ValidationError,
  getDataAccess,
} from "../app/lib/data-access";
import { applyMigrations } from "./d1";

// A review and its scores are one write: a rubric with more criteria than D1 binds in one
// insert still saves, and a failure part way leaves no review behind.
let mf: Miniflare;
let d1: D1Database;
let dataAccess: ReturnType<typeof getDataAccess>;

const CRITERIA = 40;
const reviewer: Actor = {
  userId: "u-reviewer",
  grants: [{ role: "reviewer", editionId: "ed-a" }],
} as Actor;
const revoked: Actor = { userId: "u-reviewer", grants: [] } as Actor;
const chair: Actor = { userId: "u-chair", grants: [{ role: "chair", editionId: "ed-a" }] } as Actor;
const admin: Actor = { userId: "u-chair", grants: [{ role: "admin", editionId: null }] } as Actor;
const author: Actor = { userId: "u-author", grants: [] } as Actor;
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
      "INSERT INTO user (id, email, created_at, updated_at) VALUES ('u-author', 'author@example.com', 1, 1), ('u-chair', 'chair@example.com', 1, 1)",
    ),
    db.prepare(
      "INSERT INTO edition (id, slug, name, season, year, status, created_at, updated_at) VALUES ('ed-a', 'spring-2026', 'Sample meeting', 'spring', 2026, 'scheduled', 1, 1), ('ed-b', 'fall-2026', 'Other meeting', 'fall', 2026, 'scheduled', 1, 1)",
    ),
    db.prepare(
      "INSERT INTO abstract_category (id, edition_id, name, created_at) VALUES ('cat-a', 'ed-a', 'Sample topic', 1), ('cat-b', 'ed-b', 'Other topic', 1)",
    ),
    db.prepare(
      "INSERT INTO abstract (id, edition_id, submitter_id, title, status, created_at, updated_at) VALUES ('a-1', 'ed-a', 'u-author', 'Second abstract', 'submitted', 1, 1), ('a-draft', 'ed-a', 'u-author', 'Draft abstract', 'draft', 1, 1), ('a-2', 'ed-a', 'u-author', 'Third abstract', 'submitted', 1, 1)",
    ),
    db.prepare(
      "INSERT INTO author (id, abstract_id, first_name, last_name, email, ordinal, is_presenting, created_at) VALUES ('au-1', 'a-1', 'Sam', 'Author', 'Reviewer@Example.com', 1, 1, 1)",
    ),
    db.prepare(
      "INSERT INTO abstract (id, edition_id, submitter_id, title, status, created_at, updated_at) VALUES ('a-0', 'ed-a', 'u-reviewer', 'Sample abstract', 'accepted', 1, 1)",
    ),
    db.prepare(
      "INSERT INTO review_assignment (id, edition_id, abstract_id, reviewer_id, assigned_at, created_at) VALUES ('as-0', 'ed-a', 'a-0', 'u-reviewer', 1, 1)",
    ),
    db.prepare(
      "INSERT INTO review_assignment (id, edition_id, abstract_id, reviewer_id, assigned_at, created_at) VALUES ('as-2', 'ed-a', 'a-2', 'u-reviewer', 1, 1)",
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

test("a reviewer whose grant was revoked can neither open nor submit an assignment", async () => {
  await assert.rejects(dataAccess.reviews.getAssignmentForReview(revoked, "as-0"), ForbiddenError);
  await assert.rejects(
    dataAccess.reviews.submit(revoked, {
      assignmentId: "as-0",
      recommendation: "accept",
      scores: [],
    }),
    ForbiddenError,
  );
});

test("an assigned reviewer cannot open the edit form that carries author emails", async () => {
  await assert.rejects(dataAccess.abstracts.getForEdit(reviewer, "a-2"), ForbiddenError);
  assert.ok(await dataAccess.abstracts.getForEdit(author, "a-2"));
});

test("the conflict check on an author's email ignores case", async () => {
  await assert.rejects(
    dataAccess.reviews.assignReviewer(chair, { abstractId: "a-1", reviewerId: "u-reviewer" }),
    ConflictOfInterestError,
  );
});

test("a topic from another meeting is dropped from an abstract", async () => {
  await dataAccess.abstracts.update(chair, "a-1", { categoryId: "cat-a" });
  assert.equal(
    (await dataAccess.abstracts.update(chair, "a-1", { categoryId: "cat-b" })).categoryId,
    null,
  );
});

test("a decision moves the status with it, and a decided abstract cannot be submitted again", async () => {
  const status = async (id: string) =>
    (await d1
      .prepare("SELECT status FROM abstract WHERE id = ?")
      .bind(id)
      .first<{ status: string }>())!.status;
  const accept = {
    abstractId: "a-1",
    outcome: "accept" as const,
    presentationType: "oral" as const,
  };
  await dataAccess.decisions.setDecision(chair, accept);
  assert.equal(await status("a-1"), "accepted");
  await assert.rejects(dataAccess.abstracts.submit(author, "a-1"), ValidationError);
  await dataAccess.decisions.setDecision(chair, { abstractId: "a-1", outcome: "revise" });
  assert.equal(await status("a-1"), "submitted");
  await assert.rejects(
    dataAccess.decisions.setDecision(chair, { ...accept, abstractId: "a-draft" }),
    ValidationError,
  );
});

test("a brand image cannot be published", async () => {
  const doc = await dataAccess.documents.create(admin, {
    category: "brand_image",
    title: "Sample logo",
  });
  await assert.rejects(dataAccess.documents.publish(admin, doc.id), ValidationError);
  await assert.rejects(
    dataAccess.documents.update(admin, doc.id, { status: "published" }),
    ValidationError,
  );
});

test("a topic in use cannot be removed", async () => {
  await dataAccess.abstracts.update(chair, "a-1", { categoryId: "cat-a" });
  await assert.rejects(dataAccess.abstractCategories.remove(admin, "cat-a"), ValidationError);
});

test("a book generates again and reorders in one batch each", async () => {
  const first = await dataAccess.books.generate(chair, "ed-a");
  const again = await dataAccess.books.generate(chair, "ed-a");
  const entryIds = again.sections.flatMap((s) => s.entries.map((e) => e.entryId));
  assert.ok(entryIds.length > 0 && first.bookId === again.bookId);
  const reversed = [...entryIds].reverse();
  const view = await dataAccess.books.reorder(chair, "ed-a", {
    sections: [
      { sectionId: again.sections[0].sectionId, entryIds: reversed },
      ...again.sections.slice(1).map((s) => ({ sectionId: s.sectionId, entryIds: [] })),
    ],
  });
  assert.equal(view.sections.flatMap((s) => s.entries).length, entryIds.length);
});

test("the public program leaves out an abstract that is no longer accepted, the builder keeps it", async () => {
  const session = await dataAccess.programSessions.create(chair, {
    editionId: "ed-a",
    title: "Sample session",
  });
  await dataAccess.programItems.addAbstract(chair, { sessionId: session.id, abstractId: "a-0" });
  const shown = async () =>
    JSON.stringify(await dataAccess.programSessions.getPublicProgram("ed-a")).includes('"a-0"');
  assert.equal(await shown(), true);
  await d1.prepare("UPDATE abstract SET status = 'withdrawn' WHERE id = 'a-0'").run();
  assert.equal(await shown(), false);
  assert.equal((await dataAccess.programSessions.listForEdition(chair, "ed-a"))[0].items.length, 1);
});
