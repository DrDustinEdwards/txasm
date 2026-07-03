import { getSessionUser } from "./auth.server";
import {
  ForbiddenError,
  NotFoundError,
  getActor,
  getDataAccess,
} from "./data-access";

// Stream a document's stored PDF from R2 for the inline viewer or a download.
// Gating lives in the data-access layer (published is public, draft/generated is
// chair/admin); this resolves the optional actor, picks the bucket by source
// (generated books live in BOOKS, uploaded archive PDFs in UPLOADS), and returns
// a 404 when the row, its key, or the object is missing. application/pdf either
// way; only the Content-Disposition differs.
export async function serveDocument(
  request: Request,
  env: Env,
  slug: string,
  disposition: "inline" | "attachment",
): Promise<Response> {
  const user = await getSessionUser(request);
  const actor = user ? await getActor(env, user.id) : null;

  let doc;
  try {
    doc = await getDataAccess(env).documents.getForServe(actor, slug);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Response("Document not found.", { status: 404 });
    }
    if (error instanceof ForbiddenError) {
      throw new Response("Forbidden", { status: 403 });
    }
    throw error;
  }

  if (!doc.r2Key) {
    throw new Response("No file for this document.", { status: 404 });
  }

  const bucket = doc.source === "generated" ? env.BOOKS : env.UPLOADS;
  const object = await bucket.get(doc.r2Key);
  if (!object) {
    throw new Response("The document file is missing.", { status: 404 });
  }

  // Keep the Content-Disposition filename ASCII-safe.
  const fallbackName = `${slug}.pdf`;
  const safeName =
    (doc.fileName ?? fallbackName).replace(/[^\w .()-]/g, "_").trim() ||
    fallbackName;

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `${disposition}; filename="${safeName}"`);
  if (typeof object.size === "number") {
    headers.set("Content-Length", String(object.size));
  }
  if (object.httpEtag) headers.set("ETag", object.httpEtag);

  return new Response(object.body, { headers });
}
