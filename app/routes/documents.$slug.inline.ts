import type { Route } from "./+types/documents.$slug.inline";
import { cloudflareContext } from "~/load-context";
import { serveDocument } from "~/lib/serve-document.server";

// Streams a document's PDF inline (Content-Disposition inline) so the shared
// viewer, or the browser, can render it in place. Published documents are public;
// draft and generated documents stay chair/admin, enforced in the data layer.
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return serveDocument(request, env, params.slug, "inline");
}
