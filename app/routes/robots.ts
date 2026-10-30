// /robots.txt from Prelum's robotsResponse, the family bot policy: search engines and AI search agents crawl free,
// training crawlers are allowed so Cloudflare Pay Per Crawl can charge or block them, and the denied bots get
// Disallow: /. Signed-in, admin and API paths stay out. Until the txasm.org cutover the workers.dev copy is a preview,
// told Disallow: / for everyone. The notes are Prelum's default, the ai.txt and llms.txt pointers.
import { robotsResponse } from "@drdustinedwards/site-helpers/robots";
import { ROBOTS_DISALLOW, SITE_ORIGIN } from "~/lib/site-meta";
import type { Route } from "./+types/robots";

export function loader({ request }: Route.LoaderArgs) {
  return robotsResponse({ origin: SITE_ORIGIN, request, disallow: ROBOTS_DISALLOW });
}
