// What txasm's nightly dump must leave out and carry, for d1-dump's runCheckedBackup, which runs
// the standard checks (not empty, nothing excluded present, every required table there) and
// countProblems below. Pure (no bindings) so tests can plant a bad dump.
import type { DumpResult } from "@dustinedwards/d1-dump";

// Never back up live credentials or one-time tokens: a backup is one more place a
// session could leak from, and restoring one would revive old sign-ins. Sessions are
// not in D1 at all (Better Auth keeps them in KV).
export const EXCLUDED_TABLES = [
  // Better Auth magic-link tokens and other one-time verification values.
  "verification",
  // Better Auth account rows carry access, refresh and id tokens and a password
  // hash column. Sign-in is magic-link only, so the table holds no data the
  // site needs back; a user signs in again and the row is recreated.
  "account",
  // Reviewer and chair invitations carry a live one-time accept token.
  "invitation",
] as const;

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

/** txasm's own checks: one message per failed check; empty means they pass. */
export function countProblems(
  dump: Pick<DumpResult, "tables">,
  liveCounts: Record<string, number>,
): string[] {
  const problems: string[] = [];
  const byName = new Map(dump.tables.map((t) => [t.name, t.rows]));
  for (const name of REQUIRED_TABLES) {
    const dumped = byName.get(name);
    if (dumped === undefined) continue; // d1-dump's required check names it
    const live = liveCounts[name];
    if (live === undefined) problems.push(`no live count for ${name}`);
    else if (dumped !== live) problems.push(`${name} dumped ${dumped} rows but has ${live}`);
  }
  if ((byName.get(ALWAYS_NON_EMPTY) ?? 0) === 0) {
    problems.push(`${ALWAYS_NON_EMPTY} dumped empty`);
  }
  return problems;
}
