// /health: site-runtime's siteHealthResponse, 503 only when D1 does not answer: every page, sign-in, submission and review
// reads D1, so without it the site is down, and that is the one fail-level check (`ping`). Everything else is "warn"
// and 200, because the site still serves: a stale or missing dump or uploads copy, a
// job that failed, stopped or never ran (`cron_runs`, read against the Worker's own job lists), a run of failed
// sign-ins or sign-in mails in the last hour (`auth_events`), and each binding below.
// The two buckets were fail level until 31 Oct 2026; they are warn by choice: with UPLOADS down, only figures,
// camera-ready files and the media library's pictures fail to load, and with BOOKS down only the generated books and
// the backup, while pages, sign-in, submission and review go on.
//
// Not probed: the two rate limit bindings (CARREL_RATE_LIMIT, CSP_REPORT_RATE_LIMIT), which have no read that does
// not spend a request's count. BROWSER is checked as bound only; a real probe would open a billed browser session.
//
// `sha` is the deployed commit, which CI's deploy passes as DEPLOY_SHA (devkit's worker-deploy.yml; a manual deploy has
// none). No table names, counts or keys.
import {
  authSpikeCheck,
  browserCheck,
  durableObjectCheck,
  aiOutcomeCheck,
  imagesCheck,
  r2Check,
  siteHealthResponse,
} from "@dustinedwards/site-runtime/health";
import { d1FireStore } from "@dustinedwards/site-runtime/routine";
import type { Route } from "./+types/health";
import { backupStatus } from "~/lib/backup.server";
import { allCronJobs } from "~/lib/cron.server";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";

export function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return siteHealthResponse(env, {
    backup: () => backupStatus(env),
    jobs: allCronJobs(env),
    checks: [
      { ...r2Check("uploads", env.UPLOADS), level: "warn" },
      { ...r2Check("books", env.BOOKS), level: "warn" },
      imagesCheck("images", env.IMAGES),
      durableObjectCheck("rate-limiter", env.RATE_LIMITER),
      browserCheck("browser", env.BROWSER),
      // A run of failed sign-ins or sign-in mails in the last hour (auth_events), warn only.
      authSpikeCheck(env.DB),
      aiOutcomeCheck("alt-text", d1FireStore(env.DB, "ai_outcomes")),
    ],
  });
}
