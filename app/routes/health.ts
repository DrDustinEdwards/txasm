// /health: site-runtime's siteHealthResponse, 503 only when D1 does not answer (`ping`, the one fail-level check):
// every page, sign-in, submission and review reads D1. Everything else is "warn" and 200 because the site still serves:
// a stale or missing dump or uploads copy, a failed, stopped or never-run job (`cron_runs`), a run of failed sign-ins or
// sign-in mails in the last hour (`auth_events`), and each binding below. The two buckets are warn by choice: with
// UPLOADS down only figures, camera-ready files and library pictures fail, with BOOKS down only generated books and the
// backup.
//
// Not probed: the two rate limit bindings (a read spends the count) and BROWSER (a probe opens a billed session).
// `sha` is the deployed commit, passed by CI's deploy as DEPLOY_SHA. No table names, counts or keys.
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
