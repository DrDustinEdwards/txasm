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
  writeCompleteMarker,
  type BackupHealth,
} from "@dustinedwards/d1-dump";
import { REQUIRED_TABLES, dumpProblems } from "./backup-checks";
import { EXCLUDED_TABLES } from "./backup-excluded";

export { EXCLUDED_TABLES };

type BackupEnv = Pick<Env, "DB" | "BOOKS">;

async function liveCounts(env: BackupEnv): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const name of REQUIRED_TABLES) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).first<{
      n: number;
    }>();
    counts[name] = row?.n ?? 0;
  }
  return counts;
}

// Dump unmarked, check, then mark complete. A dump that fails its checks is kept
// as evidence but never counts as the latest, and this throws so the failure
// shows in Workers Logs while the health age keeps growing toward its warning.
export async function runNightlyBackup(env: BackupEnv): Promise<void> {
  const dump = await dumpDatabase(env.DB, env.BOOKS, {
    exclude: [...EXCLUDED_TABLES],
    markComplete: false,
  });
  const problems = dumpProblems(dump, await liveCounts(env));
  if (problems.length > 0) {
    throw new Error(`backup ${dump.run_id} left incomplete: ${problems.join("; ")}`);
  }
  await writeCompleteMarker(env.BOOKS, dump);
  console.log(JSON.stringify({ event: "backup.dumped", run_id: dump.run_id }));
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
