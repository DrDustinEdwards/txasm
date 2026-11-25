import { prepareUpload, RefusedError } from "@dustinedwards/site-api";
import { redirect } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { ValidationError, getDataAccess } from "~/lib/data-access";
import {
  DOCUMENT_CATEGORIES,
  IMAGE_MIME_TYPES,
  allowedMimeTypesForCategory,
  extensionForMime,
  fileKindForMime,
  isImageCategory,
  maxUploadBytesForKind,
  type DocumentCategory,
} from "~/lib/vocab";
import { concatBytes } from "@dustinedwards/site-runtime/encoding";
import { parseYear } from "~/lib/form.server";
import { type MultipartPart, partText, readMultipart } from "@dustinedwards/site-runtime/body";

export function toCategory(value: string | null): DocumentCategory | undefined {
  return DOCUMENT_CATEGORIES.includes(value as DocumentCategory)
    ? (value as DocumentCategory)
    : undefined;
}

export function optionalText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

export function optionalId(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

export function seasonValue(value: FormDataEntryValue | null): "spring" | "fall" | null {
  const raw = String(value ?? "").trim();
  return raw === "spring" || raw === "fall" ? raw : null;
}

const MAX_UPLOAD_REQUEST = maxUploadBytesForKind("pdf") + 1024 * 1024;
const PDF_MAGIC = new TextEncoder().encode("%PDF-");

async function* capped(chunks: AsyncGenerator<Uint8Array>, max: number) {
  let total = 0;
  for await (const chunk of chunks) {
    total += chunk.length;
    if (total > max)
      throw new ValidationError(
        `The file must be ${Math.round(max / (1024 * 1024))} MB or smaller.`,
      );
    yield chunk;
  }
}

async function* prepend(head: Uint8Array, rest: AsyncGenerator<Uint8Array>) {
  if (head.length) yield head;
  for (let next = await rest.next(); !next.done; next = await rest.next()) yield next.value;
}

async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  return concatBytes(...parts);
}

// R2 needs a stream's length before a put, and a multipart part has none, so a file larger than one part goes up as
// an R2 multipart upload: parts of PART_BYTES (R2 wants every part but the last the same size, at least 5 MiB), one
// held in memory at a time. A file within one part is a plain put.
const PART_BYTES = 8 * 1024 * 1024;
async function storeStream(
  bucket: R2Bucket,
  key: string,
  contentType: string,
  chunks: AsyncIterable<Uint8Array>,
) {
  const httpMetadata = { contentType };
  const part = new Uint8Array(PART_BYTES);
  let filled = 0;
  let upload: R2MultipartUpload | null = null;
  const parts: R2UploadedPart[] = [];
  try {
    for await (let chunk of chunks) {
      while (chunk.length > 0) {
        const n = Math.min(chunk.length, PART_BYTES - filled);
        part.set(chunk.subarray(0, n), filled);
        filled += n;
        chunk = chunk.subarray(n);
        if (filled === PART_BYTES) {
          upload ??= await bucket.createMultipartUpload(key, { httpMetadata });
          parts.push(await upload.uploadPart(parts.length + 1, part));
          filled = 0;
        }
      }
    }
    if (!upload) {
      await bucket.put(key, part.subarray(0, filled), { httpMetadata });
      return;
    }
    if (filled > 0) parts.push(await upload.uploadPart(parts.length + 1, part.subarray(0, filled)));
    await upload.complete(parts);
  } catch (error) {
    await upload?.abort().catch(() => undefined);
    throw error;
  }
}

type DataAccess = ReturnType<typeof getDataAccess>;
type Admin = Awaited<ReturnType<typeof requireAdmin>>["actor"];

// The upload form, read part by part rather than buffered: the browser sends its fields in page order, so the text
// fields arrive first, then the file, which is checked on its first bytes and streamed to R2, then "publish".
export async function createDocument(request: Request, env: Env, da: DataAccess, actor: Admin) {
  const fields = new Map<string, string>();
  let createdId: string | null = null;
  try {
    for await (const part of readMultipart(request, MAX_UPLOAD_REQUEST)) {
      if (part.filename === null) fields.set(part.name, await partText(part));
      else if (part.name === "file" && !createdId)
        createdId = await storeUpload(part, fields, env, da, actor);
    }
  } catch (error) {
    // The shared reader refuses a body that does not parse, or a field too long, with a 400; here it shows on the form
    // as a ValidationError. The 413 over the ceiling still goes out as it is.
    if (error instanceof Response && error.status === 400) {
      throw new ValidationError((await error.text()) || "Could not read the upload. Try again.");
    }
    throw error;
  }
  if (!createdId) throw new ValidationError("Choose a file to upload.");
  const publish = fields.get("publish") && fields.get("category") !== "brand_image";
  if (publish) await da.documents.publish(actor, createdId);
  return redirect("/admin/documents");
}

async function storeUpload(
  part: MultipartPart,
  fields: Map<string, string>,
  env: Env,
  da: DataAccess,
  actor: Admin,
) {
  if (fields.get("intent") !== "create") throw new ValidationError("Unknown action.");
  if (!part.filename) throw new ValidationError("Choose a file to upload.");
  const category = toCategory(fields.get("category") ?? "");
  if (!category) {
    throw new ValidationError("Choose a valid document category.");
  }
  // Validate the declared MIME server-side against what the category accepts
  // (PDF for publications, images for brand_image), not the file extension.
  const mime = part.type;
  const wrongType = isImageCategory(category)
    ? "Brand images must be a PNG, JPEG, WebP, GIF, or SVG file."
    : "The file must be a PDF.";
  if (!mime || !allowedMimeTypesForCategory(category).includes(mime)) {
    throw new ValidationError(wrongType);
  }
  const maxBytes = maxUploadBytesForKind(fileKindForMime(mime));
  const chunks = capped(part.chunks(), maxBytes);
  // Peek at the first bytes: a PDF must start with %PDF-, whatever type it declares.
  let head: Uint8Array = new Uint8Array(0);
  while (head.length < PDF_MAGIC.length) {
    const next = await chunks.next();
    if (next.done) break;
    head = concatBytes(head, next.value);
  }
  if (head.length === 0) throw new ValidationError("Choose a file to upload.");
  const file = prepend(head, chunks);

  // A brand image (5 MB at most) goes through site-api's upload step, as a library picture does: its bytes must be
  // the type it declares (no PNG that is really HTML), and its location is taken out. A PDF is stored as sent.
  let image: ArrayBuffer | Uint8Array | null = null;
  if (isImageCategory(category)) {
    try {
      const prepared = await prepareUpload(
        env.IMAGES,
        {
          bytes: await collect(file),
          contentType: mime,
          filename: part.filename,
          alt: "",
          changeId: "",
        },
        { limits: { maxBytes, types: [...IMAGE_MIME_TYPES] } },
      );
      // Only the location goes: no HEIC is accepted here, and no shrink is asked for, so the type is the one declared.
      image = prepared.bytes;
    } catch (err) {
      if (err instanceof RefusedError) throw new ValidationError(err.message);
      throw err;
    }
  } else if (!PDF_MAGIC.every((byte, i) => head[i] === byte)) {
    throw new ValidationError(wrongType);
  }

  // Create the metadata row first so slug validation runs before the R2 write,
  // then store the object under a stable key and record it. The stored MIME
  // sets fileKind in the data layer, so the viewer branches on the real type.
  // A PDF too large or cut off on the way leaves no row behind.
  const created = await da.documents.create(actor, {
    category,
    title: fields.get("title") ?? "",
    year: parseYear(fields.get("year") ?? null),
    season: seasonValue(fields.get("season") ?? null),
    editionId: optionalId(fields.get("editionId") ?? null),
    editor: optionalText(fields.get("editor") ?? null),
    slug: optionalText(fields.get("slug") ?? null),
    fileName: part.filename,
    mimeType: mime,
  });
  const r2Key = `documents/${created.id}.${extensionForMime(mime)}`;
  try {
    if (image)
      await env.UPLOADS.put(r2Key, image, {
        httpMetadata: { contentType: mime },
      });
    else await storeStream(env.UPLOADS, r2Key, mime, file);
  } catch (error) {
    await da.documents.remove(actor, created.id);
    throw error;
  }
  await da.documents.update(actor, created.id, { r2Key });
  return created.id;
}
