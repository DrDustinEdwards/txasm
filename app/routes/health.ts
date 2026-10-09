import type { Route } from "./+types/health";
import { cloudflareContext } from "~/load-context";
import { getBackupHealth } from "~/lib/backup.server";

// Unauthenticated health response. Only the age of the last complete D1 dump:
// last_ok, age_hours and a warning when it is stale or missing.
export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const backup = await getBackupHealth(env);
  return Response.json(
    { ok: true, backupHealth: backup },
    { headers: { "Cache-Control": "no-store" } },
  );
}
