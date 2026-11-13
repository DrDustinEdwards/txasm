import type { Route } from "./+types/media.$";
import { MEDIA_ADDRESS, MEDIA_PREFIX, images } from "~/lib/media/images";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";

// The media library's files (app/lib/carrel/media-adapter.server.ts), from UPLOADS under media/:
// the original for a bare request, one size for ?w= through the Images binding (site-runtime
// ./image, whose closed width set refuses anything a page does not ask for). Public, as the pages
// that use them are; a trashed file keeps its address, so a page that uses it never breaks.
// The pages' addresses carry the file's version (`v`, render.server.ts), so one with it is cached
// for good; without it (an address a person copied), a day, so a replaced file shows through
// within one (serve's default policy).
// Hard rule 5: every answer, refusals too, carries UPLOAD_HEADERS (nosniff and the sandboxed CSP),
// so no file runs script.
export function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return images.serve(request, {
    read: (key) => env.UPLOADS.get(key),
    images: env.IMAGES,
    // `caches.default` is the Workers runtime's; the DOM lib does not declare it, hence the cast.
    cache: (caches as typeof caches & { default: Cache }).default,
    prefix: `/${MEDIA_PREFIX}`,
    // The same keyPrefix and within as MEDIA_ADDRESS, so the addresses pages write and the keys the route reads agree.
    keyPrefix: MEDIA_ADDRESS.keyPrefix,
    within: MEDIA_ADDRESS.within,
  });
}
