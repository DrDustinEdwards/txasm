import type { Route } from "./+types/admin.editions.$editionId.book.download";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import { getDataAccess } from "~/lib/data-access";

// Streams the stored abstract book PDF from R2. Chair/admin only for now; this
// may open to the public program page once the meeting is complete. A missing or
// not-ready book is a clear 404.
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const book = await getDataAccess(env).books.getBook(actor, params.editionId);

  if (!book || book.status !== "ready" || !book.r2Key) {
    throw new Response("No abstract book is ready for this meeting.", {
      status: 404,
    });
  }

  const object = await env.BOOKS.get(book.r2Key);
  if (!object) {
    throw new Response("The abstract book file is missing.", { status: 404 });
  }

  // Keep the Content-Disposition filename ASCII-safe.
  const fallbackName = "abstract-book.pdf";
  const safeName = (book.fileName ?? fallbackName)
    .replace(/[^\w .()-]/g, "_")
    .trim();

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${safeName || fallbackName}"`,
  );
  if (typeof object.size === "number") {
    headers.set("Content-Length", String(object.size));
  }
  if (object.httpEtag) headers.set("ETag", object.httpEtag);

  return new Response(object.body, { headers });
}
