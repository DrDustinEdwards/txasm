import { buildPolicy } from "@dustinedwards/site-runtime/csp";
import type { Route } from "./+types/media.$";
import { MEDIA_PREFIX, images, mediaKeyOf } from "~/lib/media/images";
import { cloudflareContext } from "~/load-context";

// The media library's files (app/lib/carrel/media-adapter.server.ts), from UPLOADS under media/:
// the original for a bare request, one size for ?w= through the Images binding (site-runtime
// ./image, whose closed width set refuses anything a page does not ask for). Public, as the pages
// that use them are; a trashed file keeps its address, so a page that uses it never breaks.
// Hard rule 5: image responses carry nosniff and the sandboxed CSP, so no file runs script.
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const key = mediaKeyOf(`/${MEDIA_PREFIX}${params["*"] ?? ""}`);
  if (!key) throw new Response("Not found", { status: 404 });
  const response = await images.respond(request, {
    object: await env.UPLOADS.get(key),
    images: env.IMAGES,
    // `caches.default` is the Workers runtime's; the DOM lib does not declare it, hence the cast.
    cache: (caches as typeof caches & { default: Cache }).default,
    reread: () => env.UPLOADS.get(key),
  });
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", buildPolicy(["default-src 'none'", "style-src 'unsafe-inline'", "sandbox"]));
  return new Response(response.body, { status: response.status, headers });
}
