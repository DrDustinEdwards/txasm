// The operator API's tools: the door Capsid Admin reaches txasm through (/api/operator, site-runtime ./operator, one
// implementation on every site; workers/app.ts mounts it). Checking the backups, backing up now and running any
// scheduled job now are Capsid Admin's, for every site in one place (Dustin, 2026-11-06 and 2026-11-07), so they are
// not admin routes here.
import { operatorJobTools, type CronJob } from "@dustinedwards/site-runtime/cron";
import type { OperatorTool } from "@dustinedwards/site-runtime/operator";
import { backupStatus } from "./backup.server";

/** `jobs` is every cron job with its work (workers/app.ts), for run_job. */
export function operatorTools(env: Env, jobs: () => CronJob[]): Record<string, OperatorTool> {
  return operatorJobTools({
    db: env.DB,
    jobs,
    backupStatus: () => backupStatus(env),
    files: ["uploads"],
  });
}
