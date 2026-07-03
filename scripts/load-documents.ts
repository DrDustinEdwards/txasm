// Back-catalog document loader. Reads PDFs from a local folder (the Downloads
// folder by default), parses the season and year from each filename, uploads the
// file to R2, and records it through the data-access layer as an uploaded,
// published document. Built for the eight branch newsletters first, but the
// category is a flag so abstract books and programs can be loaded the same way
// later.
//
// Run (LOCAL D1 and R2 only, the default):
//   npm run load:documents
//   npm run load:documents -- --dir "C:\\Users\\email\\Downloads" --category newsletter
//
// Idempotent per slug: an existing document with the same slug is removed (and
// its R2 object deleted) before the file is loaded again, so a re-run converges.
//
// Remote is deliberately NOT supported here. Production is loaded later, once
// reviewed: the metadata rows through the proven `wrangler d1 execute txasm
// --remote` channel (never getPlatformProxy against a remote binding, which has
// silently hit local before), and the R2 objects through `wrangler r2 object
// put`. This script only ever writes local D1 and local R2.

import { readdirSync, readFileSync } from "node:fs";
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
import {
  DOCUMENT_CATEGORIES,
  SEASON_LABELS,
  type DocumentCategory,
  type Season,
} from "../app/lib/vocab";

const DEFAULT_DIR = "C:\\Users\\email\\Downloads";

// Per-category filename shape and the slug/title suffix used for the archive.
const CATEGORY_META: Record<
  DocumentCategory,
  { keyword: string; slugSuffix: string; titleSuffix: string }
> = {
  newsletter: {
    keyword: "newsletter",
    slugSuffix: "newsletter",
    titleSuffix: "Newsletter",
  },
  abstract_book: {
    keyword: "abstract",
    slugSuffix: "abstract-book",
    titleSuffix: "Abstract Book",
  },
  program: { keyword: "program", slugSuffix: "program", titleSuffix: "Program" },
  other: { keyword: "", slugSuffix: "document", titleSuffix: "Document" },
};

// Known editors, keyed by slug. Extend as more are confirmed.
const EDITORS: Record<string, string> = {
  "fall-1991-newsletter": "G. Roland Vela",
};

function parseSeasonYear(
  filename: string,
): { season: Season; year: number } | null {
  const match = filename.match(/(spring|fall)[-_ ]?(\d{4})/i);
  if (!match) return null;
  return {
    season: match[1].toLowerCase() as Season,
    year: Number(match[2]),
  };
}

async function main() {
  const args = argv.slice(2);
  if (args.includes("--remote")) {
    console.error(
      "Remote loading is not supported here. Load production D1 through wrangler d1 execute --remote and the R2 objects through wrangler r2 object put.",
    );
    exit(1);
  }

  const dirArg = args.find((_, i) => args[i - 1] === "--dir");
  const categoryArg = args.find((_, i) => args[i - 1] === "--category");
  const dir = resolve(dirArg ?? DEFAULT_DIR);
  const category = (categoryArg ?? "newsletter") as DocumentCategory;
  if (!DOCUMENT_CATEGORIES.includes(category)) {
    console.error(`Unknown category "${category}".`);
    exit(1);
  }
  const meta = CATEGORY_META[category];

  // Every PDF in the folder that names this category and a season and year.
  const files = readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .filter((name) =>
      meta.keyword ? name.toLowerCase().includes(meta.keyword) : true,
    )
    .sort();

  console.log(
    `Loading ${category} PDFs from ${dir} into local D1 and R2 (${files.length} candidate files).`,
  );

  const proxy = await getPlatformProxy<Env>({});
  const env = proxy.env;

  const summary = {
    loaded: 0,
    replaced: 0,
    slugs: [] as string[],
    skipped: [] as Array<{ file: string; reason: string }>,
  };

  try {
    const da = getDataAccess(env);
    const systemUserId = await getMeetingImporter(env).ensureSystemUser();
    const actor: Actor = {
      userId: systemUserId,
      grants: [{ role: "admin", editionId: null }],
    };

    for (const file of files) {
      const parsed = parseSeasonYear(file);
      if (!parsed) {
        summary.skipped.push({ file, reason: "no season/year in filename" });
        continue;
      }
      const { season, year } = parsed;
      const slug = `${season}-${year}-${meta.slugSuffix}`;
      const title = `${SEASON_LABELS[season]} ${year} ${meta.titleSuffix}`;

      try {
        // Idempotency: drop an existing document with this slug and its object.
        try {
          const existing = await da.documents.getForServe(actor, slug);
          const removed = await da.documents.remove(actor, existing.id);
          if (removed.r2Key) await env.UPLOADS.delete(removed.r2Key);
          summary.replaced += 1;
        } catch (error) {
          if (!(error instanceof NotFoundError)) throw error;
        }

        const bytes = readFileSync(resolve(dir, file));
        const created = await da.documents.create(actor, {
          category,
          title,
          year,
          season,
          editor: EDITORS[slug] ?? null,
          slug,
          fileName: file,
        });
        const r2Key = `documents/${created.id}.pdf`;
        await env.UPLOADS.put(r2Key, new Uint8Array(bytes), {
          httpMetadata: { contentType: "application/pdf" },
        });
        await da.documents.update(actor, created.id, { r2Key });
        await da.documents.publish(actor, created.id);

        summary.loaded += 1;
        summary.slugs.push(slug);
      } catch (error) {
        const message =
          error instanceof ValidationError || error instanceof Error
            ? error.message
            : String(error);
        summary.skipped.push({ file, reason: message });
      }
    }
  } finally {
    await proxy.dispose();
  }

  console.log("");
  console.log("Document load summary (local D1 and R2)");
  console.log(`  documents loaded:   ${summary.loaded}`);
  console.log(`  documents replaced: ${summary.replaced}`);
  for (const slug of summary.slugs) {
    console.log(`    ${slug}`);
  }
  console.log(`  files skipped:      ${summary.skipped.length}`);
  for (const skip of summary.skipped) {
    console.log(`    ${skip.file}: ${skip.reason}`);
  }
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
