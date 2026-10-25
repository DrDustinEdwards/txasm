// /health: site-runtime's healthResponse. 200 when D1 answers, 503 when it does not; `ok` is false while the
// newest complete dump is stale or missing (Grok audit 2026-10-21, TX-6). No table names, counts or keys.
import { backupHealth } from "@dustinedwards/d1-dump";
import { healthResponse } from "@dustinedwards/site-runtime/health";
import type { Route } from "./+types/health";
import { cloudflareContext } from "~/load-context";

export function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return healthResponse({ ping: () => env.DB.prepare("select 1").first(), backup: () => backupHealth(env.BOOKS) });
}
