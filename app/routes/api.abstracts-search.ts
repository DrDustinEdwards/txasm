import type { Route } from "./+types/api.abstracts-search";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import type { AbstractFormat, AbstractLevel } from "~/lib/vocab";

// Public JSON search endpoint over accepted abstracts of public-stage editions.
// Every value goes to the parameterized data-access search, which also validates
// the level and format against the vocabularies. The meetings page uses the same
// data-access call for its no-JS server render; this is the JSON equivalent.
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const filters = {
    level: (url.searchParams.get("level") || undefined) as
      | AbstractLevel
      | undefined,
    format: (url.searchParams.get("format") || undefined) as
      | AbstractFormat
      | undefined,
    meeting: url.searchParams.get("meeting") || undefined,
  };
  const da = getDataAccess(context.get(cloudflareContext).env);
  const results = await da.publicAbstracts.search(q, filters);
  return Response.json({ results });
}
