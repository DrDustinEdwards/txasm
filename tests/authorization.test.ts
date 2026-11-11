import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import {
  ConflictOfInterestError,
  ForbiddenError,
  ValidationError,
  getActor,
  getDataAccess,
  isAdmin,
  type Actor,
} from "../app/lib/data-access";
import { ACCOUNT_REFERENCES } from "../app/lib/data-access/account";
import { getTableName } from "drizzle-orm";
import { applyMigrations } from "./d1";

// The data-access layer is the security boundary (CLAUDE.md hard rule 1) and
// every listing is a per-edition query (hard rule 2), so both are tested against
// real D1 with the real migrations. Meeting A has more accepted abstracts than
// D1 binds in one query (100), as real meetings do (spring 2026 had 108), and
// meeting B has its own, which must never show up in A's lists.
let mf: Miniflare;
let d1: D1Database;
let dataAccess: ReturnType<typeof getDataAccess>;

const IN_A = 120;
const IN_B = 3;
const chairOfA: Actor = {
  userId: "u-chair",
  grants: [{ role: "chair", editionId: "ed-a" }],
} as Actor;
const author: Actor = { userId: "u-author", grants: [] } as Actor;
const stranger: Actor = { userId: "u-stranger", grants: [] } as Actor;

before(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  d1 = db as unknown as D1Database;
  await applyMigrations(db);
  const run = (sql: string, ...values: unknown[]) =>
    db
      .prepare(sql)
      .bind(...values)
      .run();
  for (const id of ["u-chair", "u-author", "u-stranger"]) {
    await run(
      "INSERT INTO user (id, email, created_at, updated_at) VALUES (?, ?, 1, 1)",
      id,
      `${id}@example.com`,
    );
  }
  for (const [id, slug, season] of [
    ["ed-a", "spring-2026", "spring"],
    ["ed-b", "fall-2026", "fall"],
  ]) {
    await run(
      "INSERT INTO edition (id, slug, name, season, year, status, created_at, updated_at) VALUES (?, ?, 'Sample meeting', ?, 2026, 'scheduled', 1, 1)",
      id,
      slug,
      season,
    );
  }
  const abstracts: Array<[string, string]> = [
    ...Array.from({ length: IN_A }, (_, i) => [`a-${i}`, "ed-a"] as [string, string]),
    ...Array.from({ length: IN_B }, (_, i) => [`b-${i}`, "ed-b"] as [string, string]),
  ];
  const statements = abstracts.flatMap(([id, editionId]) => [
    db
      .prepare(
        "INSERT INTO abstract (id, edition_id, submitter_id, title, status, created_at, updated_at) VALUES (?, ?, 'u-author', ?, 'accepted', 1, 1)",
      )
      .bind(id, editionId, `Sample abstract ${id}`),
    db
      .prepare(
        "INSERT INTO author (id, abstract_id, first_name, last_name, ordinal, is_presenting, created_at) VALUES (?, ?, 'Sam', ?, 1, 1, 1)",
      )
      .bind(`au-${id}`, id, `Author ${id}`),
    db
      .prepare(
        "INSERT INTO affiliation (id, abstract_id, ordinal, institution) VALUES (?, ?, 1, 'Sample University')",
      )
      .bind(`af-${id}`, id),
    db
      .prepare("INSERT INTO author_affiliation (author_id, affiliation_id) VALUES (?, ?)")
      .bind(`au-${id}`, `af-${id}`),
  ]);
  await db.batch(statements);
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

test("an abstract is read only by its submitter, its chair or an assigned reviewer", async () => {
  assert.equal((await dataAccess.abstracts.get(author, "a-0")).id, "a-0");
  assert.equal((await dataAccess.abstracts.get(chairOfA, "a-0")).id, "a-0");
  await assert.rejects(dataAccess.abstracts.get(stranger, "a-0"), ForbiddenError);
  await assert.rejects(dataAccess.abstracts.get(chairOfA, "b-0"), ForbiddenError);
});

test("an author cannot be assigned to review their own abstract", async () => {
  await assert.rejects(
    dataAccess.reviews.assignReviewer(chairOfA, { abstractId: "a-0", reviewerId: "u-author" }),
    ConflictOfInterestError,
  );
});

test("a meeting's lists hold all of its abstracts and none of another's", async () => {
  const onlyA = (ids: string[]) => {
    assert.equal(ids.length, IN_A);
    assert.ok(ids.every((id) => id.startsWith("a-")));
  };
  onlyA((await dataAccess.abstracts.listForEdition(chairOfA, "ed-a")).map((r) => r.id));
  onlyA((await dataAccess.decisions.listForEdition(chairOfA, "ed-a")).map((r) => r.id));
  onlyA(
    (await dataAccess.programItems.listUnplacedAbstracts(chairOfA, "ed-a")).map(
      (r) => r.abstractId,
    ),
  );
  const book = await dataAccess.books.generate(chairOfA, "ed-a");
  onlyA(book.sections.flatMap((s) => s.entries.map((e) => e.abstractId)));
  assert.equal((await dataAccess.books.renderData(chairOfA, "ed-a")).entryCount, IN_A);
  const listing = await dataAccess.publicAbstracts.listForEdition("spring-2026");
  assert.equal(listing?.abstracts.length, IN_A);
  assert.deepEqual(listing?.abstracts[0].authors[0].affiliationOrdinals, [1]);
  await assert.rejects(dataAccess.abstracts.listForEdition(chairOfA, "ed-b"), ForbiddenError);
});

test("an author's decisions come back in one read, theirs only", async () => {
  await d1
    .prepare(
      "INSERT INTO decision (id, edition_id, abstract_id, outcome, presentation_type, decided_by_id, decided_at, created_at, updated_at) VALUES ('d-a-1', 'ed-a', 'a-1', 'accept', 'poster', 'u-chair', 1, 1, 1)",
    )
    .run();
  try {
    const mine = await dataAccess.decisions.listForMine(author);
    assert.deepEqual([...mine.keys()], ["a-1"]);
    assert.equal(mine.get("a-1")?.outcome, "accept");
    assert.deepEqual(
      await dataAccess.decisions.getForAbstract(author, "a-1"),
      mine.get("a-1"),
      "the same fields getForAbstract gives",
    );
    assert.equal((await dataAccess.decisions.listForMine(stranger)).size, 0);
  } finally {
    await d1.prepare("DELETE FROM decision WHERE id = 'd-a-1'").run();
  }
});

// Saving an abstract's authors replaces them, its affiliations and their links together: one bad field refuses the
// save before anything is deleted, so the abstract keeps the lists it had.
test("an abstract's authors and affiliations are replaced together or not at all", async () => {
  const chairOfB = { userId: "u-chair", grants: [{ role: "chair", editionId: "ed-b" }] } as Actor;
  const lines = () =>
    d1
      .prepare(
        "SELECT au.last_name AS name, af.institution AS institution FROM author au LEFT JOIN author_affiliation l ON l.author_id = au.id LEFT JOIN affiliation af ON af.id = l.affiliation_id WHERE au.abstract_id = 'b-0' ORDER BY au.ordinal, af.ordinal",
      )
      .all()
      .then((r) => r.results);
  const before = await lines();
  assert.deepEqual(before, [{ name: "Author b-0", institution: "Sample University" }]);

  await assert.rejects(
    dataAccess.abstracts.setContributors(chairOfB, "b-0", {
      affiliations: [{ institution: "Example College" }],
      authors: [{ firstName: "Ada", lastName: 42 as unknown as string, affiliationOrdinals: [1] }],
    }),
    ValidationError,
  );
  assert.deepEqual(await lines(), before);

  await dataAccess.abstracts.setContributors(chairOfB, "b-0", {
    affiliations: [{ institution: "Example College" }, { institution: "Sample University" }],
    authors: [
      { firstName: "Ada", lastName: "Lovelace", affiliationOrdinals: [2, 1, 1] },
      { firstName: "Sam", lastName: "Sample", affiliationOrdinals: [2, 9] },
    ],
  });
  assert.deepEqual(await lines(), [
    { name: "Lovelace", institution: "Example College" },
    { name: "Lovelace", institution: "Sample University" },
    { name: "Sample", institution: "Sample University" },
  ]);
});

// Deleting an account (/account): the person goes, what they put into a Meeting stays, handed to a
// "Deleted account" user. The list must name every reference to user.id that does not cascade, or the
// delete would fail on a foreign key after Better Auth had already ended the sessions.
test("deleting an account keeps its meeting records and refuses only an active role", async () => {
  const tables = await d1
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all<{ name: string }>();
  const blocking = new Set<string>();
  for (const { name } of tables.results.filter((t) => !/^(_cf_|sqlite_|d1_)/.test(t.name))) {
    const keys = await d1
      .prepare(`PRAGMA foreign_key_list("${name}")`)
      .all<{ table: string; from: string; on_delete: string }>();
    for (const key of keys.results)
      if (key.table === "user" && key.on_delete !== "CASCADE") blocking.add(`${name}.${key.from}`);
  }
  assert.deepEqual(
    new Set(ACCOUNT_REFERENCES.map(([table, column]) => `${getTableName(table)}.${column.name}`)),
    blocking,
  );

  assert.deepEqual(await dataAccess.account.deletionBlockers("u-author"), []);
  await d1
    .prepare(
      "INSERT INTO user (id, email, created_at, updated_at) VALUES ('u-leaving', 'leaving@example.com', 1, 1)",
    )
    .run();
  await d1
    .prepare(
      "INSERT INTO role_grant (id, user_id, role, edition_id, status, created_at) VALUES ('g-leaving', 'u-leaving', 'reviewer', 'ed-a', 'active', 1)",
    )
    .run();
  assert.deepEqual(await dataAccess.account.deletionBlockers("u-leaving"), ["role"]);
  await d1.prepare("UPDATE role_grant SET status = 'revoked' WHERE id = 'g-leaving'").run();
  assert.deepEqual(await dataAccess.account.deletionBlockers("u-leaving"), []);
  await d1.prepare("DELETE FROM user WHERE id = 'u-leaving'").run();

  // The author owns an abstract: handing over keeps the abstract and its author line, drops the contact email, and lets the user row go.
  const abstractsBefore = await d1
    .prepare("SELECT COUNT(*) AS n FROM abstract WHERE submitter_id = 'u-author'")
    .first<{ n: number }>();
  assert.ok(abstractsBefore && abstractsBefore.n > 0);
  await d1
    .prepare(
      "INSERT INTO author (id, abstract_id, user_id, first_name, last_name, email, ordinal, created_at) SELECT 'au-test', id, 'u-author', 'Ada', 'Lovelace', 'ada@example.com', 1, 1 FROM abstract WHERE submitter_id = 'u-author' LIMIT 1",
    )
    .run();
  await dataAccess.account.handOverRecords("u-author");
  await dataAccess.account.handOverRecords("u-author"); // a retry after a half-finished delete changes nothing
  await d1.prepare("DELETE FROM user WHERE id = 'u-author'").run();
  const kept = await d1
    .prepare("SELECT COUNT(*) AS n FROM abstract WHERE submitter_id = 'deleted-u-author'")
    .first<{ n: number }>();
  assert.equal(kept?.n, abstractsBefore.n);
  const line = await d1
    .prepare("SELECT first_name, last_name, email, user_id FROM author WHERE id = 'au-test'")
    .first<Record<string, unknown>>();
  assert.deepEqual(line, {
    first_name: "Ada",
    last_name: "Lovelace",
    email: null,
    user_id: "deleted-u-author",
  });
  const heir = await d1
    .prepare("SELECT name, email FROM user WHERE id = 'deleted-u-author'")
    .first<Record<string, unknown>>();
  assert.deepEqual(heir, { name: "Deleted account", email: "deleted-u-author@deleted.invalid" });
});

test("platform admin is the ADMIN_EMAIL and CO_OWNER_EMAILS roster on every request, never an old admin grant", async () => {
  await d1
    .prepare(
      "INSERT INTO user (id, email, created_at, updated_at) VALUES ('u-former', 'former@example.com', 1, 1)",
    )
    .run();
  // An admin row seeded at sign-up before admin moved to the list.
  await d1
    .prepare(
      "INSERT INTO role_grant (id, user_id, role, edition_id, status, created_at) VALUES ('g-former', 'u-former', 'admin', NULL, 'active', 1)",
    )
    .run();
  const user = { id: "u-former", email: "Former@example.com" };
  const env = (admin: string, coOwners = "") =>
    ({ DB: d1, ADMIN_EMAIL: admin, CO_OWNER_EMAILS: coOwners }) as unknown as Env;
  assert.equal(isAdmin(await getActor(env("someone@example.com"), user)), false);
  assert.equal(
    isAdmin(await getActor(env("someone@example.com", "x@example.com, former@example.com"), user)),
    true,
  );
  assert.equal(isAdmin(await getActor(env("", "former@example.com"), user)), false);
});

test("award search matches %, _ and backslash as typed, in the term and the institution filter", async () => {
  const run = (sql: string, ...values: unknown[]) =>
    d1
      .prepare(sql)
      .bind(...values)
      .run();
  await run(
    "INSERT INTO award (id, slug, name, created_at, updated_at) VALUES ('aw-1', 'sample-award', 'Sample Award', 1, 1)",
  );
  for (const [id, person, institution] of [
    ["ar-1", "Pat 50% Sample", "Sample_Lab"],
    ["ar-2", "Pat 500 Sample", "SampleXLab"],
  ]) {
    await run(
      "INSERT INTO award_recipient (id, award_id, year, person_name, institution, created_at, updated_at) VALUES (?, 'aw-1', '2026', ?, ?, 1, 1)",
      id,
      person,
      institution,
    );
  }
  const ids = async (query: string, institution?: string) =>
    (await dataAccess.awardRecipients.search(query, { institution })).map((r) => r.id).sort();
  assert.deepEqual(await ids("50%"), ["ar-1"]);
  assert.deepEqual(await ids("", "Sample_Lab"), ["ar-1"]);
  assert.deepEqual(await ids("50"), ["ar-1", "ar-2"]);
});
