// Nightly D1 backup into the BOOKS bucket under backups/json/, by d1-dump's
// runCheckedBackup: dump without the marker, check, mark complete, prune. A run
// that fails a check throws BackupIncomplete and keeps its objects without the
// marker, so the failure shows in Workers Logs while the health age keeps growing.
// It is a system job with no acting user, so like the auth helpers it reads the
// D1 binding directly (it never imports the schema or the Drizzle client).
import {
  backupHealth,
  runCheckedBackup,
  type BackupHealth,
} from "@dustinedwards/d1-dump";
import { EXCLUDED_TABLES, REQUIRED_TABLES, countProblems } from "./backup-checks";

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

export async function runNightlyBackup(env: BackupEnv): Promise<void> {
  const { dump, pruned } = await runCheckedBackup(env.DB, env.BOOKS, {
    exclude: [...EXCLUDED_TABLES],
    required: [...REQUIRED_TABLES],
    check: async (d) => countProblems(d, await liveCounts(env)),
  });
  console.log(JSON.stringify({ event: "backup.dumped", run_id: dump.run_id }));
  console.log(JSON.stringify({ event: "backup.pruned", ...pruned }));
}

// Unauthenticated fields only: when the last complete dump ran and how old it
// is. Never table names, row counts or object keys.
export async function getBackupHealth(
  env: Pick<Env, "BOOKS">,
): Promise<BackupHealth> {
  return backupHealth(env.BOOKS);
}
