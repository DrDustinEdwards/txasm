import type { Route } from "./+types/admin.editions.$editionId.book.download";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { generatedPdfResponse } from "~/lib/serve-document.server";

// Streams the stored abstract book PDF from R2. Chair/admin only for now; this
// may open to the public program page once the meeting is complete. A missing or
// not-ready book is a clear 404.
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return generatedPdfResponse(
    request,
    env,
    params.editionId,
    "abstract_book",
    "abstract book",
    "abstract-book.pdf",
  );
}
