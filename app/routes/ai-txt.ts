// /ai.txt from Prelum's aiTxt, the family AI usage policy: answer engines may cite and link, training rights are
// reserved (as the TDMRep header in app/lib/security-headers.ts says) and licensed through the branch's contact address.
import { aiTxt } from "@drdustinedwards/site-helpers/robots";
import { getDataAccess } from "~/lib/data-access";
import { ROBOTS_DISALLOW, SITE_ORIGIN } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import type { Route } from "./+types/ai-txt";

export async function loader({ context }: Route.LoaderArgs) {
  const settings = await getDataAccess(context.get(cloudflareContext).env).settings.get();
  const body = aiTxt({
    origin: SITE_ORIGIN,
    name: settings.orgName || "Texas Branch of the American Society for Microbiology",
    contact: settings.contactEmail ?? `${SITE_ORIGIN}/contact`,
    disallow: ROBOTS_DISALLOW,
  });
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
