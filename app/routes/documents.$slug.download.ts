import type { Route } from "./+types/documents.$slug.download";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { serveDocument } from "~/lib/serve-document.server";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return serveDocument(request, env, params.slug, "attachment");
}
