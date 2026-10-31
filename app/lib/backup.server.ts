// Nightly D1 backup into the BOOKS bucket under backups/json/, by d1-dump's
// runCheckedBackup: dump without the marker, check, mark complete, prune. A run
// that fails a check throws BackupIncomplete and keeps its objects without the
// marker, so the failure shows in Workers Logs while the health age keeps growing.
// The credential tables are excluded (backup-checks.ts), and the credential-column
// check refuses a dump that carries any other column named like a credential.
//
// The dumps live in BOOKS, a content bucket (the generated abstract books), not a
// bucket of their own: the site has no backups bucket binding. Moving them means a
// new txasm-backups bucket with its lock rule, a BACKUPS binding, and the restore
// drill's `bucket` pointed at it in the same change; until then the dumps and the
// books share one bucket, under separate prefixes (backups/, files/).
//
// Not backed up: BOOKS' own PDFs, made again from the frozen render each book keeps
// in D1; RATE_LIMITER (a Durable Object of per-address sign-in counts, in windows of
// an hour to 30 days: losing them only resets the limits); and the rate limit
// bindings (counters of a minute). The site has no KV namespace.
// It is a system job with no acting user, so like the auth helpers it reads the
// D1 binding directly (it never imports the schema or the Drizzle client).
// The UPLOADS bucket (figures, camera-ready files, the media library) is copied
// beside the dumps under files/uploads/ by d1-dump's backupFiles.
import { backupFiles, backupHealth, filesHealth, runCheckedBackup } from "@dustinedwards/d1-dump";
import { logEvent } from "@dustinedwards/site-runtime/log";
import { CREDENTIAL_ALLOW, EXCLUDED_TABLES, REQUIRED_TABLES, siteProblems } from "./backup-checks";

type BackupEnv = Pick<Env, "DB" | "BOOKS">;

// The uploads pass stops itself at three minutes and goes on the next night, inside
// its job's four-minute timeout (cron.server.ts).
const FILES = { name: "uploads", timeBudgetMs: 180_000 };

export async function runNightlyBackup(env: BackupEnv): Promise<void> {
  const { dump, pruned } = await runCheckedBackup(env.DB, env.BOOKS, {
    exclude: [...EXCLUDED_TABLES],
    credentials: { allow: CREDENTIAL_ALLOW },
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
