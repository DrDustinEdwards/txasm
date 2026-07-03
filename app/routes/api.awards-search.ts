import type { Route } from "./+types/api.awards-search";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";

// Public JSON search endpoint over award recipients. Every value is passed to the
// parameterized data-access search; nothing is interpolated into SQL. The search
// page uses the same data-access call for its no-JS server render; this resource
// route is the JSON equivalent for any client.
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const filters = {
    awardSlug: url.searchParams.get("award") || undefined,
    year: url.searchParams.get("year") || undefined,
    institution: url.searchParams.get("institution") || undefined,
  };
  const da = getDataAccess(context.get(cloudflareContext).env);
  const results = await da.awardRecipients.search(q, filters);
  return Response.json({ results });
}
