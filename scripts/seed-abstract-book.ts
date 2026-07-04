// Orchestrates the two-step abstract-book seeding pipeline:
//   1. Python parser  -> raw JSON bundle (scripts/seed-data/<slug>.json)
//   2. Metadata merge -> fills meeting placeholders from seed-configs/<slug>.json
//
// Does NOT import to D1. After this script finishes, review the output JSON
// (especially parse flags and level fields on poster abstracts), then run:
//   npm run import:meeting -- scripts/seed-data/<slug>.json
//
// Usage:
//   npm run seed:abstract-book -- <slug>
//   npm run seed:abstract-book -- fall-2024

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

interface SeedConfig {
  slug: string;
  name: string;
  season: "spring" | "fall";
  year: number;
  meetingStartsAt: string; // YYYY-MM-DD
  meetingEndsAt: string;   // YYYY-MM-DD
  venueName: string;
  city: string;
  pdfPath: string; // relative to project root, or absolute
}

interface ParseFlag {
  flag: string;
  context?: string;
}

interface ParsedBundle {
  meeting: Record<string, unknown>;
  topics: string[];
  abstracts: unknown[];
  withdrawn: unknown[];
  parseFlags: ParseFlag[];
}

async function main() {
  const args = argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--"));

  if (!slug) {
    console.error("Usage: npm run seed:abstract-book -- <slug>");
    console.error("  e.g. npm run seed:abstract-book -- fall-2024");
    exit(1);
  }

  // Load seed config
  const configPath = resolve(ROOT, "seed-configs", `${slug}.json`);
  if (!existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    console.error(
      `Create seed-configs/${slug}.json with slug, name, season, year, dates, venueName, city, pdfPath.`,
    );
    exit(1);
  }
  const config = JSON.parse(readFileSync(configPath, "utf8")) as SeedConfig;

  // Resolve PDF -- relative paths are from the project root
  const pdfPath = resolve(ROOT, config.pdfPath);
  if (!existsSync(pdfPath)) {
    console.error(`PDF not found: ${pdfPath}`);
    console.error(
      `Update "pdfPath" in ${configPath} to an absolute path, or place the file at the project root.`,
    );
    exit(1);
  }

  // Paths
  const seedDataDir = resolve(ROOT, "scripts", "seed-data");
  const outPath = resolve(seedDataDir, `${slug}.json`);
  const tmpPath = resolve(seedDataDir, `${slug}.tmp.json`);
  const parserPath = resolve(
    ROOT,
    "scripts",
    "parsers",
    "parse-abstract-book.py",
  );

  mkdirSync(seedDataDir, { recursive: true });

  // Step 1: run the Python parser
  console.log(`Parsing ${basename(pdfPath)} ...`);
  try {
    execSync(`python3 "${parserPath}" "${pdfPath}" "${tmpPath}"`, {
      stdio: "inherit",
      cwd: ROOT,
    });
  } catch {
    console.error(
      "Parser failed. Ensure PyMuPDF is installed: pip install pymupdf",
    );
    exit(1);
  }

  if (!existsSync(tmpPath)) {
    console.error("Parser exited without producing output.");
    exit(1);
  }

  // Step 2: read parser output and merge config metadata
  const bundle = JSON.parse(readFileSync(tmpPath, "utf8")) as ParsedBundle;

  bundle.meeting = {
    ...bundle.meeting,
    slug: config.slug,
    name: config.name,
    season: config.season,
    year: config.year,
    status: "archived",
    meetingStartsAt: config.meetingStartsAt,
    meetingEndsAt: config.meetingEndsAt,
    venueName: config.venueName,
    city: config.city,
  };

  writeFileSync(outPath, JSON.stringify(bundle, null, 2) + "\n", "utf8");
  rmSync(tmpPath, { force: true });

  // Summary
  const nTopics    = bundle.topics.length;
  const nAbstracts = bundle.abstracts.length;
  const nWithdrawn = bundle.withdrawn.length;
  const nFlags     = bundle.parseFlags.length;

  console.log("");
  console.log(`Output: scripts/seed-data/${slug}.json`);
  console.log(`  Topics:    ${nTopics}`);
  console.log(`  Abstracts: ${nAbstracts}`);
  console.log(`  Withdrawn: ${nWithdrawn}`);
  console.log(`  Flags:     ${nFlags}`);

  if (nFlags > 0) {
    console.log("");
    console.log("Parse flags (review before seeding):");
    for (const f of bundle.parseFlags.slice(0, 20)) {
      const ctx = f.context ? ` -- ${f.context}` : "";
      console.log(`  ${f.flag}${ctx}`);
    }
    if (nFlags > 20) {
      console.log(`  ... ${nFlags - 20} more in the output JSON`);
    }
  }

  console.log("");
  console.log("Next steps:");
  console.log(`  1. Open scripts/seed-data/${slug}.json`);
  console.log("     - Resolve any parse flags");
  console.log(
    "     - Set 'level' on poster abstracts (graduate, undergraduate, etc.)",
  );
  console.log(
    `  2. npm run import:meeting -- scripts/seed-data/${slug}.json`,
  );
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
