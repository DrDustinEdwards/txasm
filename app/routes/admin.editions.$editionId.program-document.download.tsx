import type { Route } from "./+types/admin.editions.$editionId.program-document.download";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { generatedPdfResponse } from "~/lib/serve-document.server";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return generatedPdfResponse(
    request,
    env,
    params.editionId,
    "program",
    "program document",
    "program.pdf",
  );
}
