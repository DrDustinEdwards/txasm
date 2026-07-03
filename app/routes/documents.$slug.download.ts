import type { Route } from "./+types/documents.$slug.download";
import { cloudflareContext } from "~/load-context";
import { serveDocument } from "~/lib/serve-document.server";

// Streams a document's PDF as an attachment (Content-Disposition attachment) for
// the Download button. Same gating and 404 behavior as the inline route.
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return serveDocument(request, env, params.slug, "attachment");
}
