// Nightly D1 backup into the BOOKS bucket under backups/json/, using d1-dump. It
// is a system job with no acting user, so like the auth helpers it reads the D1
// binding directly (it never imports the schema or the Drizzle client). It
// copies whole tables, so it is the one place that must be told which tables
// must not be copied.
//
// Never back up live credentials or one-time tokens: a backup is one more place a
// session could leak from, and restoring one would revive old sign-ins.
import {
  backupHealth,
  dumpDatabase,
  pruneDumps,
  type BackupHealth,
} from "@dustinedwards/d1-dump";

// Excluded whole. Sessions are not in D1 at all (Better Auth keeps them in KV).
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

type BackupEnv = Pick<Env, "DB" | "BOOKS">;

export async function runNightlyBackup(env: BackupEnv): Promise<void> {
  const dump = await dumpDatabase(env.DB, env.BOOKS, {
    exclude: [...EXCLUDED_TABLES],
  });
  console.log(
    JSON.stringify({ event: "backup.dumped", run_id: dump.run_id }),
  );
  const pruned = await pruneDumps(env.BOOKS);
  console.log(JSON.stringify({ event: "backup.pruned", ...pruned }));
}

// Unauthenticated fields only: when the last complete dump ran and how old it
// is. Never table names, row counts or object keys.
export async function getBackupHealth(
  env: Pick<Env, "BOOKS">,
): Promise<BackupHealth> {
  return backupHealth(env.BOOKS);
}
