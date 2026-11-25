// Nightly D1 backup into the BOOKS bucket under backups/json/, by d1-dump's runCheckedBackup: dump without the marker,
// check, mark complete, prune. A failed check throws BackupIncomplete and keeps the objects without the marker, so the
// health age keeps growing. The credential tables are excluded (backup-checks.ts) and d1-dump's credential-column check
// refuses any other credential-like column.
//
// The dumps share BOOKS (a content bucket) under backups/; the site has no backups bucket binding. Moving them means a
// new locked txasm-backups bucket, a BACKUPS binding and the restore drill's `bucket` pointed at it in one change.
//
// Not backed up: BOOKS' PDFs (made again from each book's frozen render in D1) and the RATE_LIMITER Durable Object
// (losing it only resets limits). The UPLOADS bucket is copied under files/uploads/ by d1-dump's backupFiles.
// A system job with no acting user, it reads the D1 binding directly, never the schema or Drizzle client.
import { createSiteBackup } from "@dustinedwards/d1-dump";
import { logEvent } from "@dustinedwards/site-runtime/log";
import { CREDENTIAL_ALLOW, EXCLUDED_TABLES, REQUIRED_TABLES, siteProblems } from "./backup-checks";

type BackupEnv = Pick<Env, "DB" | "BOOKS" | "UPLOADS">;

const backup = createSiteBackup<BackupEnv>({
  // The dumps and the uploads copy go into BOOKS (see the header), not a BACKUPS binding.
  bucket: (env) => env.BOOKS,
  dump: {
    exclude: [...EXCLUDED_TABLES],
    credentials: { allow: CREDENTIAL_ALLOW },
    counted: [...REQUIRED_TABLES],
    check: siteProblems,
  },
  // The uploads pass stops itself at three minutes and goes on the next night, inside
  // its job's four-minute timeout (cron.server.ts).
  files: [{ name: "uploads", source: (env) => env.UPLOADS, timeBudgetMs: 180_000 }],
});

export async function runNightlyBackup(env: BackupEnv): Promise<void> {
  const { dump, pruned } = await backup.runBackup(env);
  logEvent("backup_dumped", { run_id: dump.run_id, ...pruned });
}

export async function backupUploads(env: BackupEnv): Promise<void> {
  for (const pass of (await backup.runFilesBackup(env)).files)
    logEvent("files_backed_up", { ...pass });
}

/** /health's backup: the newest dump's age, with the uploads copy's; the first warning is reported. */
export const backupStatus = (env: BackupEnv) => backup.status(env);
