// Nightly D1 backup into the BOOKS bucket under backups/json/, by d1-dump's
// runCheckedBackup: dump without the marker, check, mark complete, prune. A run
// that fails a check throws BackupIncomplete and keeps its objects without the
// marker, so the failure shows in Workers Logs while the health age keeps growing.
// It is a system job with no acting user, so like the auth helpers it reads the
// D1 binding directly (it never imports the schema or the Drizzle client).
import { runCheckedBackup } from "@dustinedwards/d1-dump";
import { EXCLUDED_TABLES, REQUIRED_TABLES, siteProblems } from "./backup-checks";

type BackupEnv = Pick<Env, "DB" | "BOOKS">;

export async function runNightlyBackup(env: BackupEnv): Promise<void> {
  const { dump, pruned } = await runCheckedBackup(env.DB, env.BOOKS, {
    exclude: [...EXCLUDED_TABLES],
    counted: [...REQUIRED_TABLES],
    check: siteProblems,
  });
  console.log(JSON.stringify({ event: "backup.dumped", run_id: dump.run_id }));
  console.log(JSON.stringify({ event: "backup.pruned", ...pruned }));
}
