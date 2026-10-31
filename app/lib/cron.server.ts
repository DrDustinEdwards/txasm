// The scheduled jobs, keyed by the cron that fires them (wrangler.jsonc triggers.crons). workers/app.ts runs the list
// for the cron it receives through site-runtime's runJobs, and /health's cronCheck reads every list (names and
// intervals only), so a job whose trigger never fires warns as "never ran".
//
// Every minute: the updates Carrel scheduled go live (handler.server.ts), with 50 seconds, so a hung run never runs
// into the next minute's. Daily: the nightly D1 backup, the uploads copy beside it (a pass stops itself at three
// minutes and goes on the next day), the 404 count's pruning and the auth event rows' (a year, or 30 days for one
// with no user; site-runtime ./sign-in), eleven minutes in all, inside a scheduled invocation's 15. The deadline
// jobs and reminders (submission and review deadline reminders, status transitions) join the daily list when they
// are wired per edition.
import type { CronJob } from "@dustinedwards/site-runtime/cron";
import { pruneNotFound } from "@dustinedwards/site-runtime/not-found";
import { pruneAuthEvents } from "@dustinedwards/site-runtime/sign-in";
import { backupUploads, runNightlyBackup } from "~/lib/backup.server";
import { runCarrelSchedules } from "~/lib/carrel/handler.server";

const SCHEDULES_CRON = "* * * * *";
const DAILY_CRON = "0 13 * * *";

const MINUTE = 60_000;
const DAY = 1440;

export function cronJobs(env: Env, scheduledTime: Date): Record<string, CronJob[]> {
  return {
    [SCHEDULES_CRON]: [
      { name: "carrel-schedules", everyMinutes: 1, timeoutMs: 50_000, run: () => runCarrelSchedules(env, scheduledTime) },
    ],
    [DAILY_CRON]: [
      { name: "backup", everyMinutes: DAY, timeoutMs: 5 * MINUTE, run: () => runNightlyBackup(env) },
      { name: "backup-uploads", everyMinutes: DAY, timeoutMs: 4 * MINUTE, run: () => backupUploads(env) },
      { name: "prune-404", everyMinutes: DAY, timeoutMs: MINUTE, run: () => pruneNotFound(env.DB, { days: 90 }) },
      { name: "prune-auth-events", everyMinutes: DAY, timeoutMs: MINUTE, run: () => pruneAuthEvents(env.DB) },
    ],
  };
}

/** Every job of every cron, for /health's cronCheck (it reads names and intervals; `run` is never called). */
export function allCronJobs(env: Env): CronJob[] {
  return Object.values(cronJobs(env, new Date())).flat();
}
