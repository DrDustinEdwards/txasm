// The scheduled jobs, keyed by the cron that fires them (wrangler.jsonc triggers.crons). workers/app.ts runs the list
// for the cron it receives through site-runtime's runJobs, and /health's cronCheck reads every list (names and
// intervals only), so a job whose trigger never fires warns as "never ran".
//
// Every minute: the updates Carrel scheduled go live (handler.server.ts), with 50 seconds, so a hung run never runs
// into the next minute's. Daily, at 03:00 UTC like the other sites: the nightly D1 backup, the uploads copy beside it
// (a pass stops itself at three minutes and goes on the next day), the 404 count's pruning and the auth event rows'
// (a year, or 30 days for one with no user; site-runtime ./sign-in), eleven minutes in all, inside a scheduled
// invocation's 15. The dump must land before capsid-backups' 11:23 UTC Amazon copy: at 13:00 the copy took the
// day before's dump and aged past 30 hours (offaccount-late-txasm). The deadline jobs and reminders (submission and
// review deadline reminders, status transitions) join the daily list when they are wired per edition.
import {
  backupJob,
  carrelSchedulesJob,
  DAILY_MINUTES,
  type CronJob,
} from "@dustinedwards/site-runtime/cron";
import { pruneNotFoundJob } from "@dustinedwards/site-runtime/not-found";
import { pruneAuthEventsJob } from "@dustinedwards/site-runtime/sign-in";
import { backupUploads, runNightlyBackup } from "~/lib/backup.server";
import { runCarrelSchedules } from "~/lib/carrel/handler.server";
import { rerenderStale } from "~/lib/carrel/render.server";
import { logEvent } from "@dustinedwards/site-runtime/log";
import { runPageDates } from "~/lib/page-dates.server";

const SCHEDULES_CRON = "* * * * *";
const DAILY_CRON = "0 3 * * *";

const FOUR_MINUTES = 4 * 60_000;

export function cronJobs(env: Env, scheduledTime: Date): Record<string, CronJob[]> {
  return {
    [SCHEDULES_CRON]: [
      carrelSchedulesJob(() => runCarrelSchedules(env, scheduledTime)),
      // A page a Prelum upgrade left on an older render is stored again within a minute of the deploy.
      {
        name: "rerender-stale",
        everyMinutes: 1,
        timeoutMs: 50_000,
        run: async () => {
          const done = await rerenderStale(env);
          if (done) logEvent("render_stale", { pages: done });
        },
      },
    ],
    [DAILY_CRON]: [
      backupJob(() => runNightlyBackup(env)),
      backupJob(() => backupUploads(env), {
        name: "backup-uploads",
        timeoutMs: FOUR_MINUTES,
      }),
      // The day each code-written page last changed, for /sitemap.xml's lastmod (app/lib/page-dates.server.ts).
      {
        name: "page-dates",
        everyMinutes: DAILY_MINUTES,
        timeoutMs: 2 * 60_000,
        run: () => runPageDates(env),
      },
      pruneNotFoundJob(env.DB),
      pruneAuthEventsJob(env.DB),
    ],
  };
}

/** Every job of every cron, for /health's cronCheck (it reads names and intervals; `run` is never called). */
export function allCronJobs(env: Env): CronJob[] {
  return Object.values(cronJobs(env, new Date())).flat();
}
