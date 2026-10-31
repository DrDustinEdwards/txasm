// What txasm's nightly dump must leave out and carry, for d1-dump's runCheckedBackup, which runs
// the standard checks (not empty, nothing excluded present, every counted table there with its
// live row count) and siteProblems below. Pure (no bindings) so tests can plant a bad dump.
import type { DumpResult } from "@dustinedwards/d1-dump";

// Never back up live credentials or one-time tokens: a backup is one more place a
// session could leak from, and restoring one would revive old sign-ins.
export const EXCLUDED_TABLES = [
  // Better Auth sessions: live sign-in tokens.
  "session",
  // Better Auth's sign-in rate-limit counts, which mean nothing after a minute.
  "rate_limit",
  // Better Auth magic-link tokens and other one-time verification values.
  "verification",
  // Better Auth account rows carry access, refresh and id tokens and a password
  // hash column. Sign-in is a passkey or an email link, so the table holds no data the
  // site needs back; a user signs in again and the row is recreated.
  "account",
  // Reviewer and chair invitations carry a live one-time accept token.
  "invitation",
  // Carrel's preview links (site-api's store): the hash of each link's token. Restoring an older copy would bring
  // back a link revoked since; a lost link is made again in Carrel.
  "preview_links",
] as const;

// Columns named like a credential that the dump keeps, each with why (d1-dump's
// credential-column check refuses any other).
export const CREDENTIAL_ALLOW: Record<string, string> = {
  "passkey.credential_id":
    "a passkey's public id, sent to every browser that signs in with it; the private key never leaves the device, and a restore must keep it or every passkey stops working",
};

// The irreplaceable data: people, registrations (payment state lives on
// registration), abstracts and their authors, reviews and decisions, and the
// edition and platform settings every page reads. Each must be dumped and match
// the live row count, read straight after the dump (d1-dump's `counted`).
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

/** txasm's own check: one message per failure; empty means it passes. */
export function siteProblems(dump: Pick<DumpResult, "tables">): string[] {
  const rows = dump.tables.find((t) => t.name === ALWAYS_NON_EMPTY)?.rows ?? 0;
  return rows === 0 ? [`${ALWAYS_NON_EMPTY} dumped empty`] : [];
}
