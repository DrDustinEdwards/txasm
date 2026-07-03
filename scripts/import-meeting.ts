// Reusable meeting-import seed script. It reads a standard dataset JSON bundle
// (see scripts/seed-data/) and inserts a full archived meeting through the
// data-access layer, so the seeded abstracts run the same title and body
// sanitizers and the same validation as live submissions. This is a permanent
// tool for importing the ~23 past abstract books, not a one-off: all
// meeting-specific values come from the data file, never from this code.
//
// Run (local D1, the default):
//   npm run import:meeting -- scripts/seed-data/spring-2026.json
//   npm run import:meeting -- scripts/seed-data/spring-2026.json --clear
//
// It is idempotent per meeting slug: if the edition slug already exists it
// refuses, unless --clear is passed, which deletes the existing meeting by slug
// first (the edition row cascades to categories, abstracts, authors,
// affiliations, and program rows). To clear without re-importing:
//   npx wrangler d1 execute txasm --local --command "DELETE FROM edition WHERE slug='spring-2026';"
//
// This script writes the LOCAL D1 only (getPlatformProxy binds to the local
// simulator; its remote-binding path does not reliably reach production D1, so it
// is not offered here). To seed PRODUCTION, run this against local, then copy the
// verified rows up with wrangler's remote channel:
//   npx wrangler d1 export txasm --local --no-schema --table edition --table \
//     abstract_category --table abstract --table author --table affiliation \
//     --table author_affiliation --output meeting.sql
//   (prepend an INSERT OR IGNORE for the system-import user; see seed-data/README)
//   npx wrangler d1 execute txasm --remote --file meeting.sql
// then verify counts with npx wrangler d1 execute txasm --remote.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, exit } from "node:process";
import { getPlatformProxy } from "wrangler";
import {
  AlreadyExistsError,
  NotFoundError,
  ValidationError,
  getDataAccess,
  getMeetingImporter,
  type AbstractFormat,
  type AbstractLevel,
  type Actor,
  type Season,
} from "../app/lib/data-access";

interface DatasetMeeting {
  slug: string;
  name: string;
  season: string;
  year: number;
  status: string;
  meetingStartsAt?: string | null;
  meetingEndsAt?: string | null;
  venueName?: string | null;
  city?: string | null;
}

interface DatasetAuthor {
  name: string;
  affil_refs?: string[];
}

interface DatasetAffiliation {
  num: string | null;
  text: string;
}

interface DatasetAbstract {
  code?: string;
  level: string | null; // null for oral presentations grouped by topic
  format: string;
  topic: string | null;
  title_html: string;
  authors: DatasetAuthor[];
  affiliations: DatasetAffiliation[];
  body_html: string;
  title_reconstructed?: boolean;
}

interface Dataset {
  meeting: DatasetMeeting;
  topics: string[];
  abstracts: DatasetAbstract[];
}

// Last whitespace-separated token is the family name, the rest is given. The
// schema stores firstName and lastName, so a single-token name goes to lastName.
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

// A YYYY-MM-DD date to a UTC Date, or null. The Worker runtime is UTC, so this
// matches how the app stores and shows meeting dates.
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// A stable label for a failed abstract in the summary.
function abstractLabel(abstract: DatasetAbstract, index: number): string {
  return abstract.code || `abstract #${index + 1}`;
}

async function main() {
  const args = argv.slice(2);
  const clear = args.includes("--clear");
  const dataPath = args.find((a) => !a.startsWith("--"));

  if (!dataPath) {
    console.error("Usage: import:meeting <path-to-dataset.json> [--clear]");
    exit(1);
  }

  const raw = readFileSync(resolve(dataPath), "utf8");
  const data = JSON.parse(raw) as Dataset;
  if (!data.meeting || !Array.isArray(data.abstracts)) {
    console.error(
      "The dataset must have a meeting object and an abstracts array.",
    );
    exit(1);
  }

  const topics = Array.isArray(data.topics) ? data.topics : [];
  console.log(
    `Importing "${data.meeting.slug}" into local D1: ${topics.length} topics, ${data.abstracts.length} abstracts in the file.`,
  );

  const proxy = await getPlatformProxy<Env>();
  const env = proxy.env;

  const summary = {
    editionsCreated: 0,
    categoriesCreated: 0,
    abstractsCreated: 0,
    authorsCreated: 0,
    affiliationsCreated: 0,
    linksCreated: 0,
    failures: [] as Array<{ label: string; error: string }>,
  };

  try {
    const da = getDataAccess(env);
    const importer = getMeetingImporter(env);

    // Idempotency: refuse or clear a meeting that already exists.
    let exists = true;
    try {
      await da.editions.get(data.meeting.slug);
    } catch (error) {
      if (error instanceof NotFoundError) exists = false;
      else throw error;
    }
    const systemUserId = await importer.ensureSystemUser();
    const actor: Actor = {
      userId: systemUserId,
      grants: [{ role: "admin", editionId: null }],
    };

    if (exists) {
      if (!clear) {
        console.error(
          `A meeting with slug "${data.meeting.slug}" already exists. Re-run with --clear to replace it.`,
        );
        exit(1);
      }
      const cleared = await importer.clearMeetingBySlug(actor, data.meeting.slug);
      console.log(
        `Cleared existing meeting "${data.meeting.slug}" (edition ${cleared.editionId}).`,
      );
    }

    // Edition.
    const edition = await importer.createArchivedEdition(actor, {
      slug: data.meeting.slug,
      name: data.meeting.name,
      season: data.meeting.season as Season,
      year: data.meeting.year,
      status: data.meeting.status as Parameters<
        typeof importer.createArchivedEdition
      >[1]["status"],
      meetingStartsAt: parseDate(data.meeting.meetingStartsAt),
      meetingEndsAt: parseDate(data.meeting.meetingEndsAt),
      venueName: data.meeting.venueName ?? null,
      city: data.meeting.city ?? null,
    });
    summary.editionsCreated += 1;

    // Topics as abstract categories, mapped by topic string to id.
    const categoryByTopic = new Map<string, string>();
    let topicSort = 0;
    for (const topic of topics) {
      const created = await da.abstractCategories.create(actor, {
        editionId: edition.id,
        name: topic,
        sortOrder: topicSort,
      });
      categoryByTopic.set(topic, created.id);
      summary.categoriesCreated += 1;
      topicSort += 1;
    }

    // Abstracts, each with its authors and affiliations. A failure is reported
    // and skipped so one bad record does not abort the run.
    for (let i = 0; i < data.abstracts.length; i += 1) {
      const abstract = data.abstracts[i];
      const label = abstractLabel(abstract, i);
      try {
        // A null or empty topic imports with no category (faithful to the book,
        // which does not categorize oral presentations by topic). A non-empty
        // topic must map to a created category, otherwise it is a data error.
        let categoryId: string | null = null;
        const topic =
          abstract.topic != null ? String(abstract.topic).trim() : "";
        if (topic.length > 0) {
          const mapped = categoryByTopic.get(topic);
          if (!mapped) {
            throw new Error(`unknown topic "${topic}"`);
          }
          categoryId = mapped;
        }

        const created = await importer.createAcceptedAbstract(actor, {
          editionId: edition.id,
          submitterId: systemUserId,
          title: abstract.title_html,
          body: abstract.body_html,
          level: (abstract.level ?? null) as AbstractLevel | null,
          format: abstract.format as AbstractFormat,
          categoryId,
        });

        // Affiliations first: ordinals are assigned by position (1..n). Map the
        // dataset affiliation numbers to those position ordinals for the links.
        const affiliations = Array.isArray(abstract.affiliations)
          ? abstract.affiliations
          : [];
        const numToOrdinal = new Map<string, number>();
        affiliations.forEach((aff, index) => {
          if (aff.num != null && String(aff.num).trim().length > 0) {
            numToOrdinal.set(String(aff.num).trim(), index + 1);
          }
        });
        const affiliationCount = await da.abstracts.setAffiliations(
          actor,
          created.id,
          affiliations.map((aff) => ({ institution: aff.text })),
        );
        summary.affiliationsCreated += affiliationCount;

        // Authors, in order, first author marked presenting. Resolve each
        // author's affiliation numbers to ordinals; when a name has no refs and
        // there is exactly one affiliation, attach it to that lone affiliation.
        const authorInputs = (abstract.authors ?? []).map((author, index) => {
          const { firstName, lastName } = splitName(author.name);
          let ordinals: number[];
          const refs = Array.isArray(author.affil_refs) ? author.affil_refs : [];
          if (refs.length > 0) {
            ordinals = refs
              .map((ref) => numToOrdinal.get(String(ref).trim()))
              .filter((n): n is number => typeof n === "number");
          } else if (affiliations.length === 1) {
            ordinals = [1];
          } else {
            ordinals = [];
          }
          return {
            firstName,
            lastName,
            isPresenting: index === 0,
            affiliationOrdinals: ordinals,
          };
        });
        const authorCount = await da.abstracts.setAuthors(
          actor,
          created.id,
          authorInputs,
        );
        summary.authorsCreated += authorCount;
        summary.linksCreated += authorInputs.reduce(
          (sum, a) => sum + a.affiliationOrdinals.length,
          0,
        );
        summary.abstractsCreated += 1;
      } catch (error) {
        const message =
          error instanceof ValidationError || error instanceof Error
            ? error.message
            : String(error);
        summary.failures.push({ label, error: message });
      }
    }
  } catch (error) {
    if (error instanceof AlreadyExistsError || error instanceof ValidationError) {
      console.error(`Import stopped: ${error.message}`);
      await proxy.dispose();
      exit(1);
    }
    await proxy.dispose();
    throw error;
  }

  await proxy.dispose();

  console.log("");
  console.log("Import summary");
  console.log(`  editions created:     ${summary.editionsCreated}`);
  console.log(`  categories created:   ${summary.categoriesCreated}`);
  console.log(`  abstracts created:    ${summary.abstractsCreated}`);
  console.log(`  authors created:      ${summary.authorsCreated}`);
  console.log(`  affiliations created: ${summary.affiliationsCreated}`);
  console.log(`  author-affil links:   ${summary.linksCreated}`);
  console.log(`  abstracts failed:     ${summary.failures.length}`);
  for (const failure of summary.failures) {
    console.log(`    ${failure.label}: ${failure.error}`);
  }
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
