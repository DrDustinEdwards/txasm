import type { Route } from "./+types/api.institutions";
import { cloudflareContext } from "~/load-context";
import { requireUser } from "~/lib/auth.server";
import { getActor, getDataAccess } from "~/lib/data-access";

// Type-ahead endpoint for the affiliation autocomplete on the submission form.
// Behind requireUser since it is part of authoring. Returns JSON search results.
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user);
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await getDataAccess(env).institutions.search(actor, query);
  return Response.json({ results });
}
