import { adminListResponse } from "@dustinedwards/site-runtime/access-drift";
import { adminEmails } from "@dustinedwards/site-runtime/access";
import type { Route } from "./+types/admin.access-drift";
import { cloudflareContext } from "~/load-context";

// The platform admins for the daily Access drift check (.github/workflows/access-drift.yml), at
// ADMIN_LIST_PATH: salted SHA-256 hashes of ADMIN_EMAILS, given only to a request Access let through
// with a service token (site-runtime adminListResponse); anything else is 404. Chairs and reviewers
// are not Access users, so they are not on it.
export function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return adminListResponse(request, env, { admins: adminEmails(env) });
}
