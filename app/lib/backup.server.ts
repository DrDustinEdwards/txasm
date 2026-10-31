// Nightly D1 backup into the BOOKS bucket under backups/json/, by d1-dump's
// runCheckedBackup: dump without the marker, check, mark complete, prune. A run
// that fails a check throws BackupIncomplete and keeps its objects without the
// marker, so the failure shows in Workers Logs while the health age keeps growing.
// It is a system job with no acting user, so like the auth helpers it reads the
// D1 binding directly (it never imports the schema or the Drizzle client).
// The UPLOADS bucket (figures, camera-ready files, the media library) is copied
// beside the dumps under files/uploads/ by d1-dump's backupFiles.
import { backupFiles, backupHealth, filesHealth, runCheckedBackup } from "@dustinedwards/d1-dump";
import { logEvent } from "@dustinedwards/site-runtime/log";
import { EXCLUDED_TABLES, REQUIRED_TABLES, siteProblems } from "./backup-checks";

type BackupEnv = Pick<Env, "DB" | "BOOKS">;

const FILES = { name: "uploads" };

export async function runNightlyBackup(env: BackupEnv): Promise<void> {
  const { dump, pruned } = await runCheckedBackup(env.DB, env.BOOKS, {
    exclude: [...EXCLUDED_TABLES],
    counted: [...REQUIRED_TABLES],
    check: siteProblems,
  });
  logEvent("backup_dumped", { run_id: dump.run_id, ...pruned });
}

export async function backupUploads(env: Pick<Env, "UPLOADS" | "BOOKS">): Promise<void> {
  logEvent("files_backed_up", { ...(await backupFiles(env.UPLOADS, env.BOOKS, FILES)) });
}

/** /health's backup: the newest dump's age, with the uploads copy's; either one's warning warns. */
export async function backupStatus(env: Pick<Env, "BOOKS">) {
  const [dump, files] = await Promise.all([backupHealth(env.BOOKS), filesHealth(env.BOOKS, FILES)]);
  const warning = [dump.warning, files.warning].filter(Boolean).join("; ");
  return { ...dump, files, ...(warning ? { warning } : {}) };
}
