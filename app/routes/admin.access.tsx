import { redirect } from "react-router";
import type { Route } from "./+types/admin.access";
import { requireUser } from "~/lib/auth.server";
import { safeAdminNext } from "@dustinedwards/site-runtime/access";
import { adminAccessOk } from "~/lib/access.server";
import { cloudflareContext } from "~/load-context";

// The one path the Cloudflare Access application covers (access.server.ts).
// Access signs the admin in before this runs and sets its cookie; this sends
// them on. It never redirects without a good cookie, so a misconfigured
// application shows this refusal instead of looping.
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  if (!(await adminAccessOk(env, request, user.email))) {
    throw new Response("Cloudflare Access did not sign you in as this account.", { status: 403 });
  }
  throw redirect(safeAdminNext(new URL(request.url).searchParams.get("next")));
}
