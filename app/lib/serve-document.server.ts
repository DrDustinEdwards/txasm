import { buildPolicy } from "@dustinedwards/site-runtime/csp";
import { getSessionUser } from "./auth.server";
import {
  ForbiddenError,
  NotFoundError,
  getActor,
  getDataAccess,
} from "./data-access";
import { extensionForMime, PDF_MIME_TYPE } from "./vocab";

// Stream a document's stored file from R2 for the inline viewer or a download.
// Gating lives in the data-access layer (published is public, draft/generated is
// chair/admin); this resolves the optional actor, picks the bucket by source
// (generated books live in BOOKS, uploaded files in UPLOADS), and returns a 404
// when the row, its key, or the object is missing. The Content-Type follows the
// stored MIME so images serve as images and PDFs as PDFs; only the
// Content-Disposition differs between inline and download.
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

  const contentType = doc.mimeType || PDF_MIME_TYPE;
  // The fallback filename's extension matches the stored type.
  const fallbackName = `${slug}.${extensionForMime(contentType)}`;
  const response = fileResponse(
    object,
    doc.fileName,
    fallbackName,
    disposition,
    contentType,
  );

  // Harden image responses. An uploaded SVG can carry script that would run if
  // the file is opened as a top-level document; nosniff plus a locked-down CSP
  // (no scripts via sandbox, no external fetches) neutralizes that while still
  // letting the image render inline. PDFs are left untouched so the browser's
  // native viewer keeps working.
  if (doc.fileKind === "image") {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set(
      "Content-Security-Policy",
      buildPolicy(["default-src 'none'", "style-src 'unsafe-inline'", "sandbox"]),
    );
  }

  return response;
}

// Stream a stored R2 object as a file (a PDF download unless told otherwise),
// with an ASCII-safe Content-Disposition filename that falls back to fallbackName.
export function fileResponse(
  object: R2ObjectBody,
  fileName: string | null,
  fallbackName: string,
  disposition: "inline" | "attachment" = "attachment",
  contentType: string = PDF_MIME_TYPE,
): Response {
  const safeName =
    (fileName ?? fallbackName).replace(/[^\w .()-]/g, "_").trim() ||
    fallbackName;

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", `${disposition}; filename="${safeName}"`);
  if (typeof object.size === "number") {
    headers.set("Content-Length", String(object.size));
  }
  if (object.httpEtag) headers.set("ETag", object.httpEtag);

  return new Response(object.body, { headers });
}
