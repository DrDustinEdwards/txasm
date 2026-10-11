// Excluded whole. Sessions are not in D1 at all (Better Auth keeps them in KV).
// Never back up live credentials or one-time tokens: a backup is one more place a
// session could leak from, and restoring one would revive old sign-ins.
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
