import type { Route } from "./+types/admin.editions.$editionId.program-document.download";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireChair } from "~/lib/auth.server";
import { generatedDownload } from "~/lib/serve-document.server";

// Streams the stored program PDF from R2. Chair/admin only. A missing or
// not-ready document is a clear 404.
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  return generatedDownload(
    env,
    actor,
    params.editionId,
    "program",
    "program document",
    "program.pdf",
  );
}
