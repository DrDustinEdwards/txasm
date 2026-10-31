// /health: site-runtime's healthResponse. 503 when D1 or an R2 bucket does not answer; a stale or missing dump or uploads
// copy, or a cron that failed or stopped, is "warn" and 200 (Grok audit 2026-10-21, TX-6). `sha` is the
// deployed commit, which CI's deploy passes as DEPLOY_SHA (devkit's worker-deploy.yml; a manual deploy has none). No
// table names, counts or keys.
import { authSpikeCheck, healthResponse, r2Check } from "@dustinedwards/site-runtime/health";
import { cronCheck } from "@dustinedwards/site-runtime/cron";
import type { Route } from "./+types/health";
import { backupStatus } from "~/lib/backup.server";
import { cloudflareContext } from "~/load-context";

export function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return healthResponse({
    ping: () => env.DB.prepare("select 1").first(),
    backup: () => backupStatus(env),
    sha: (env as { DEPLOY_SHA?: string }).DEPLOY_SHA,
    checks: [
      r2Check("uploads", env.UPLOADS),
      r2Check("books", env.BOOKS),
      cronCheck(env.DB),
      // A run of failed sign-ins or sign-in mails in the last hour (auth_events), warn only.
      authSpikeCheck(env.DB),
    ],
  });
}
