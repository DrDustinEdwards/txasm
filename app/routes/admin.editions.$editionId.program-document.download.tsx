import type { Route } from "./+types/admin.editions.$editionId.program-document.download";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import { getDataAccess } from "~/lib/data-access";
import { fileResponse } from "~/lib/serve-document.server";

// Streams the stored program PDF from R2. Chair/admin only. A missing or
// not-ready document is a clear 404.
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const doc = await getDataAccess(env).documents.getGeneratedForEdition(
    actor,
    params.editionId,
    "program",
  );

  if (!doc || doc.genStatus !== "ready" || !doc.r2Key) {
    throw new Response("No program document is ready for this meeting.", {
      status: 404,
    });
  }

  const object = await env.BOOKS.get(doc.r2Key);
  if (!object) {
    throw new Response("The program document file is missing.", { status: 404 });
  }

  return fileResponse(object, doc.fileName, "program.pdf");
}
