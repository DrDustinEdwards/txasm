// The checks a nightly dump must pass before it is marked complete. Pure (no
// d1-dump, no bindings) so tests can plant a bad dump and watch each check go red.
import { EXCLUDED_TABLES } from "./backup-excluded";

// The irreplaceable data: people, registrations (payment state lives on
// registration), abstracts and their authors, reviews and decisions, and the
// edition and platform settings every page reads. Each must be dumped and match
// the live row count.
export const REQUIRED_TABLES = [
  "user",
  "edition",
  "platform_settings",
  "registration",
  "abstract",
  "author",
  "review",
  "decision",
] as const;

// A deployed site always has platform settings (seeded), so an all-empty dump of
// it is an emptied or wrong database, not a quiet one.
const ALWAYS_NON_EMPTY = "platform_settings";

export type DumpSummary = {
  tables: Array<{ name: string; rows: number }>;
};

/** One message per failed check; empty means the dump may be marked complete. */
export function dumpProblems(
  dump: DumpSummary,
  liveCounts: Record<string, number>,
): string[] {
  const problems: string[] = [];
  if (dump.tables.length === 0) problems.push("the dump holds no tables");
  const byName = new Map(dump.tables.map((t) => [t.name, t.rows]));

  for (const name of EXCLUDED_TABLES) {
    if (byName.has(name)) problems.push(`${name} is in the dump but must be excluded`);
  }

  for (const name of REQUIRED_TABLES) {
    const dumped = byName.get(name);
    if (dumped === undefined) {
      problems.push(`${name} is missing from the dump`);
      continue;
    }
    const live = liveCounts[name];
    if (live === undefined) problems.push(`no live count for ${name}`);
    else if (dumped !== live) problems.push(`${name} dumped ${dumped} rows but has ${live}`);
  }
  if ((byName.get(ALWAYS_NON_EMPTY) ?? 0) === 0) {
    problems.push(`${ALWAYS_NON_EMPTY} dumped empty`);
  }
  return problems;
}
