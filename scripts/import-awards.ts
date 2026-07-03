// Awards import seed script. Reuses the parse-to-JSON-to-seed pattern of the
// meeting importer: a reviewable dataset (scripts/seed-data/awards.json) is the
// single source of truth, and seeding inserts it through the data-access layer so
// the same sanitization (namesake bio and description to the em/sup/sub allowlist)
// and validation (personName and year required) run as for live admin edits.
//
// Two modes:
//
//   Parse (refresh the dataset from the live pages, for review before seeding):
//     npm run import:awards -- --parse
//   Fetches each award's live txasm.org page, parses the WordPress HTML (h2
//   years, h3 categories, list items with placement/name/institution/mentor), and
//   replaces that award's recipients in awards.json. Definitions are kept. The
//   result is committed and reviewed before any seed. Requires network.
//
//   Seed (default, LOCAL D1 only):
//     npm run import:awards
//     npm run import:awards -- scripts/seed-data/awards.json
//   Reads the dataset and inserts through the data-access layer. Idempotent per
//   award slug: an existing award is deleted (its recipients cascade) and
//   reinserted, so a re-run converges to the file.
//
// Remote is deliberately NOT supported here. Production seeding is done later,
// once reviewed, through the proven `wrangler d1 execute txasm --remote` channel
// (never getPlatformProxy against a remote binding, which has silently hit local
// before). This script only ever writes local D1.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, exit } from "node:process";
import { getPlatformProxy } from "wrangler";
import {
  NotFoundError,
  ValidationError,
  getDataAccess,
  getMeetingImporter,
  type Actor,
} from "../app/lib/data-access";

const DEFAULT_DATA_PATH = "scripts/seed-data/awards.json";
const LIVE_BASE_URL = "https://txasm.org";

interface DatasetRecipient {
  year: string;
  category?: string | null;
  placement?: string | null;
  personName: string;
  institution?: string | null;
  mentor?: string | null;
}

interface DatasetAward {
  slug: string;
  name: string;
  namesakeBio?: string | null;
  description?: string | null;
  recipients?: DatasetRecipient[];
}

interface Dataset {
  _note?: string;
  awards: DatasetAward[];
}

// ---------------------------------------------------------------------------
// Parse: turn a live WordPress award page into recipient records.
// ---------------------------------------------------------------------------

// Strip HTML tags and decode the handful of entities the pages use, returning
// trimmed plain text.
function toText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&#039;|&#39;|&rsquo;/g, "'")
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// A year heading looks like "2024-25", "2024-2025", or "1971". Categories are any
// other h3 text. Return the year string when the heading is a year, else null.
function asYear(text: string): string | null {
  return /^\d{4}(\s*[-–]\s*\d{2,4})?$/.test(text)
    ? text.replace(/\s*[-–]\s*/, "-")
    : null;
}

// Pull placement, name, institution, and mentor out of one entry line. Handles
// "1st Place - Name, Institution (Mentor: X)" and "Name, Institution, Mentor: X"
// and "Name (Institution)". Best-effort: anything unparsed stays in personName.
function parseEntryLine(line: string): DatasetRecipient | null {
  let text = line.trim();
  if (!text) return null;

  let placement: string | null = null;
  const place = text.match(
    /^(1st|2nd|3rd|first|second|third|honorable\s+mention)\b\s*(place)?\s*[:.\-–]*\s*/i,
  );
  if (place) {
    const map: Record<string, string> = {
      first: "1st",
      second: "2nd",
      third: "3rd",
    };
    const token = place[1].toLowerCase();
    placement = map[token] ?? place[1].replace(/\s+/g, " ");
    text = text.slice(place[0].length).trim();
  }

  let mentor: string | null = null;
  const mentorMatch = text.match(
    /\(?\s*(?:mentor|advisor|pi)\s*:?\s*([^)]+?)\s*\)?\s*$/i,
  );
  if (mentorMatch) {
    mentor = mentorMatch[1].trim();
    text = text.slice(0, text.length - mentorMatch[0].length).trim();
  }
  text = text.replace(/[,;]\s*$/, "").trim();

  let personName = text;
  let institution: string | null = null;
  const paren = text.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    personName = paren[1].trim();
    institution = paren[2].trim();
  } else {
    const comma = text.indexOf(",");
    if (comma >= 0) {
      personName = text.slice(0, comma).trim();
      institution = text.slice(comma + 1).trim() || null;
    }
  }

  if (!personName) return null;
  // Skip footer and navigation links (social buttons, menu items) that live in
  // list items after the last year heading and would otherwise parse as a
  // trailing recipient.
  if (
    /^(facebook|twitter|x|instagram|linkedin|youtube|email|menu|home|search|contact)$/i.test(
      personName,
    )
  ) {
    return null;
  }
  return { year: "", placement, personName, institution, mentor };
}

// Walk a page's HTML in document order, tracking the current year (h2) and
// category (h3), and collect one recipient per list item or paragraph beneath.
export function parseRecipientsFromHtml(html: string): DatasetRecipient[] {
  const recipients: DatasetRecipient[] = [];
  let currentYear: string | null = null;
  let currentCategory: string | null = null;

  const blockRe =
    /<(h2|h3|li|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const text = toText(match[2]);
    if (!text) continue;
    if (tag === "h2") {
      currentYear = asYear(text) ?? currentYear;
      currentCategory = null;
      continue;
    }
    if (tag === "h3") {
      const year = asYear(text);
      if (year) {
        currentYear = year;
        currentCategory = null;
      } else {
        currentCategory = text;
      }
      continue;
    }
    // A list item or paragraph is a recipient only once a year is in scope.
    if (!currentYear) continue;
    const entry = parseEntryLine(text);
    if (!entry) continue;
    entry.year = currentYear;
    entry.category = currentCategory;
    recipients.push(entry);
  }
  return recipients;
}

async function runParse(dataPath: string): Promise<void> {
  const raw = readFileSync(dataPath, "utf8");
  const data = JSON.parse(raw) as Dataset;
  console.log(`Parsing ${data.awards.length} live award pages...`);

  for (const award of data.awards) {
    const url = `${LIVE_BASE_URL}/${award.slug}/`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.log(`  ${award.slug}: HTTP ${response.status}, kept existing`);
        continue;
      }
      const html = await response.text();
      const parsed = parseRecipientsFromHtml(html);
      award.recipients = parsed;
      console.log(`  ${award.slug}: ${parsed.length} recipients parsed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ${award.slug}: fetch failed (${message}), kept existing`);
    }
  }

  writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${dataPath}. Review the diff before seeding; run without --parse to seed local D1.`,
  );
}

// ---------------------------------------------------------------------------
// Seed: insert the reviewed dataset through the data-access layer (local D1).
// ---------------------------------------------------------------------------

async function runSeed(dataPath: string): Promise<void> {
  const raw = readFileSync(dataPath, "utf8");
  const data = JSON.parse(raw) as Dataset;
  if (!Array.isArray(data.awards)) {
    console.error("The dataset must have an awards array.");
    exit(1);
  }

  const proxy = await getPlatformProxy<Env>({});
  const env = proxy.env;

  const summary = {
    awardsCreated: 0,
    awardsReplaced: 0,
    recipientsCreated: 0,
    perAward: [] as Array<{ slug: string; recipients: number }>,
    failures: [] as Array<{ slug: string; error: string }>,
  };

  try {
    const da = getDataAccess(env);
    const systemUserId = await getMeetingImporter(env).ensureSystemUser();
    const actor: Actor = {
      userId: systemUserId,
      grants: [{ role: "admin", editionId: null }],
    };

    for (let i = 0; i < data.awards.length; i += 1) {
      const award = data.awards[i];
      try {
        // Idempotency: delete an existing award by slug first (recipients
        // cascade), then reinsert, so a re-run converges to the file.
        try {
          const existing = await da.awards.getBySlug(award.slug);
          await da.awards.remove(actor, existing.award.id);
          summary.awardsReplaced += 1;
        } catch (error) {
          if (!(error instanceof NotFoundError)) throw error;
        }

        const created = await da.awards.create(actor, {
          slug: award.slug,
          name: award.name,
          namesakeBio: award.namesakeBio ?? null,
          description: award.description ?? null,
          sortOrder: i,
        });
        summary.awardsCreated += 1;

        let recipientCount = 0;
        const recipients = Array.isArray(award.recipients)
          ? award.recipients
          : [];
        for (let r = 0; r < recipients.length; r += 1) {
          const recipient = recipients[r];
          await da.awardRecipients.create(actor, {
            awardId: created.id,
            year: recipient.year,
            category: recipient.category ?? null,
            placement: recipient.placement ?? null,
            personName: recipient.personName,
            institution: recipient.institution ?? null,
            mentor: recipient.mentor ?? null,
            sortOrder: r,
          });
          summary.recipientsCreated += 1;
          recipientCount += 1;
        }
        summary.perAward.push({ slug: award.slug, recipients: recipientCount });
      } catch (error) {
        const message =
          error instanceof ValidationError || error instanceof Error
            ? error.message
            : String(error);
        summary.failures.push({ slug: award.slug, error: message });
      }
    }
  } finally {
    await proxy.dispose();
  }

  console.log("");
  console.log("Awards import summary (local D1)");
  console.log(`  awards created:   ${summary.awardsCreated}`);
  console.log(`  awards replaced:  ${summary.awardsReplaced}`);
  console.log(`  recipients:       ${summary.recipientsCreated}`);
  for (const row of summary.perAward) {
    console.log(`    ${row.slug}: ${row.recipients}`);
  }
  console.log(`  awards failed:    ${summary.failures.length}`);
  for (const failure of summary.failures) {
    console.log(`    ${failure.slug}: ${failure.error}`);
  }
}

async function main() {
  const args = argv.slice(2);
  if (args.includes("--remote")) {
    console.error(
      "Remote seeding is not supported here. Seed production through the wrangler d1 execute --remote channel once the dataset is reviewed.",
    );
    exit(1);
  }
  const parse = args.includes("--parse");
  const dataPath = resolve(
    args.find((a) => !a.startsWith("--")) ?? DEFAULT_DATA_PATH,
  );

  if (parse) {
    await runParse(dataPath);
  } else {
    await runSeed(dataPath);
  }
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
