// /robots.txt from Prelum's robotsDocument, the family bot policy: search engines and AI search
// agents crawl free, training crawlers are allowed so Cloudflare Pay Per Crawl can charge or block
// them, and the denied bots get Disallow: /. Signed-in, admin and API paths stay out. Until the
// txasm.org cutover the workers.dev copy is told Disallow: / for everyone.
import { robotsDocument } from "@drdustinedwards/site-helpers/robots";
import { SITE_ORIGIN } from "~/lib/site-meta";
import type { Route } from "./+types/robots";

export function loader({ request }: Route.LoaderArgs) {
  const body = robotsDocument({
    origin: SITE_ORIGIN,
    disallow: [
      "/admin",
      "/api/",
      "/account",
      "/my/",
      "/review",
      "/submit/",
      "/abstracts/",
      "/signin",
      "/signout",
    ],
    preview: new URL(request.url).origin !== SITE_ORIGIN,
  });
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
