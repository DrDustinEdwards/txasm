import type { Route } from "./+types/health";
import { cloudflareContext } from "~/load-context";
import { getBackupHealth } from "~/lib/backup.server";

// Unauthenticated health response. Only the age of the last complete D1 dump:
// last_ok, age_hours and a warning when it is stale or missing. ok is false
// whenever there is a warning, so a monitor reading ok sees a stale backup
// (Grok audit 2026-10-21, TX-6).
export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const backup = await getBackupHealth(env);
  return Response.json(
    { ok: !backup.warning, backupHealth: backup },
    { headers: { "Cache-Control": "no-store" } },
  );
}
