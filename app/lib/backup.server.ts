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
