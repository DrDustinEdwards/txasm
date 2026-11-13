import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Panel } from "capsomer/react/panel";
import { Disclosure } from "capsomer/react/disclosure";
import { prepareUpload, RefusedError } from "@dustinedwards/site-api";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.documents";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireAdmin } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  NotFoundError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  IMAGE_MIME_TYPES,
  PDF_MIME_TYPE,
  SEASONS,
  SEASON_LABELS,
  allowedMimeTypesForCategory,
  extensionForMime,
  fileKindForMime,
  isImageCategory,
  maxUploadBytesForKind,
  type DocumentCategory,
} from "~/lib/vocab";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { readForm } from "@dustinedwards/site-runtime/body";
import { parseYear, FORM_LIMIT } from "~/lib/form.server";
import {
  type MultipartPart,
  multipartBoundary,
  partText,
  readMultipart,
} from "@dustinedwards/site-runtime/body";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";

// File picker hint: allow every accepted type so images are selectable for the
// brand_image category. The real gate is the per-category MIME check in the
// action; accept only filters the OS dialog.
const UPLOAD_ACCEPT = [PDF_MIME_TYPE, ...IMAGE_MIME_TYPES].join(",");

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Documents"));
}

function toCategory(value: string | null): DocumentCategory | undefined {
  return DOCUMENT_CATEGORIES.includes(value as DocumentCategory)
    ? (value as DocumentCategory)
    : undefined;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const filter = toCategory(new URL(request.url).searchParams.get("category"));
  const rows = await da.documents.listAll(actor, filter);
  const documents = rows
    .map((d) => ({
      id: d.id,
      slug: d.slug,
      title: d.title,
      category: d.category,
      status: d.status,
      source: d.source,
      year: d.year,
      season: d.season,
      editor: d.editor,
      editionId: d.editionId,
      fileKind: d.fileKind,
      hasFile: Boolean(d.r2Key),
    }))
    // Defensive: the Brand images tab shows only image files, even if a stray
    // PDF were ever filed under that category.
    .filter((d) => filter !== "brand_image" || d.fileKind === "image");
  const editionRows = await da.editions.list(actor);
  const editions = editionRows.map((e) => ({ id: e.id, name: e.name }));
  return { documents, editions, filter: filter ?? null };
}

function optionalText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function optionalId(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function seasonValue(value: FormDataEntryValue | null): "spring" | "fall" | null {
  const raw = String(value ?? "").trim();
  return raw === "spring" || raw === "fall" ? raw : null;
}

// A request to the upload form: the 50 MB PDF (vocab.ts) and room for the fields around it.
const MAX_UPLOAD_REQUEST = maxUploadBytesForKind("pdf") + 1024 * 1024;
const PDF_MAGIC = new TextEncoder().encode("%PDF-");

// A file's chunks, refused past `max` bytes as they arrive.
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

// The bytes already read, then the rest of the file.
async function* prepend(head: Uint8Array, rest: AsyncGenerator<Uint8Array>) {
  if (head.length) yield head;
  for (let next = await rest.next(); !next.done; next = await rest.next()) yield next.value;
}

async function collect(
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
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
async function createDocument(request: Request, env: Env, da: DataAccess, actor: Admin) {
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
  if (fields.get("publish")) await da.documents.publish(actor, createdId);
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
    head = await collect([head, next.value]);
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
    if (image) await env.UPLOADS.put(r2Key, image, { httpMetadata: { contentType: mime } });
    else await storeStream(env.UPLOADS, r2Key, mime, file);
  } catch (error) {
    await da.documents.remove(actor, created.id);
    throw error;
  }
  await da.documents.update(actor, created.id, { r2Key });
  return created.id;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);

  try {
    if (multipartBoundary(request.headers.get("Content-Type")))
      return await createDocument(request, env, da, actor);

    const form = await readForm(request, FORM_LIMIT);
    const intent = String(form.get("intent") ?? "");
    if (intent === "remove") {
      const id = String(form.get("documentId") ?? "");
      if (id) {
        const removed = await da.documents.remove(actor, id);
        if (removed.r2Key) {
          const bucket = removed.source === "generated" ? env.BOOKS : env.UPLOADS;
          await bucket.delete(removed.r2Key);
        }
      }
      return redirect("/admin/documents");
    }

    if (intent === "update") {
      const id = String(form.get("documentId") ?? "");
      await da.documents.update(actor, id, {
        category: String(form.get("category") ?? "") as DocumentCategory,
        title: String(form.get("title") ?? ""),
        year: parseYear(form.get("year")),
        season: seasonValue(form.get("season")),
        editionId: optionalId(form.get("editionId")),
        editor: optionalText(form.get("editor")),
        slug: optionalText(form.get("slug")),
        status: form.get("publish") ? "published" : "draft",
      });
      return redirect("/admin/documents");
    }
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof AlreadyExistsError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  return { error: "Unknown action." };
}

type Doc = Route.ComponentProps["loaderData"]["documents"][number];
type Edition = Route.ComponentProps["loaderData"]["editions"][number];

function MetaFields({ doc, editions }: { doc?: Doc; editions: Edition[] }) {
  const base = doc ? doc.id : "new";
  return (
    <div className="cap-grid" data-cols="2">
      <div className="cap-stack" data-gap="2">
        <label htmlFor={`title-${base}`} className="cap-field-label">
          Title
        </label>
        <input
          id={`title-${base}`}
          name="title"
          type="text"
          required
          defaultValue={doc?.title ?? ""}
          className="cap-input"
        />
      </div>
      <div className="cap-stack" data-gap="2">
        <label htmlFor={`category-${base}`} className="cap-field-label">
          Category
        </label>
        <select
          id={`category-${base}`}
          name="category"
          defaultValue={doc?.category ?? "newsletter"}
          className="cap-select"
        >
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {DOCUMENT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="cap-stack" data-gap="2">
        <label htmlFor={`year-${base}`} className="cap-field-label">
          Year
        </label>
        <input
          id={`year-${base}`}
          name="year"
          type="number"
          step="1"
          defaultValue={doc?.year ?? ""}
          className="cap-input"
        />
      </div>
      <div className="cap-stack" data-gap="2">
        <label htmlFor={`season-${base}`} className="cap-field-label">
          Season
        </label>
        <select
          id={`season-${base}`}
          name="season"
          defaultValue={doc?.season ?? ""}
          className="cap-select"
        >
          <option value="">None</option>
          {SEASONS.map((s) => (
            <option key={s} value={s}>
              {SEASON_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="cap-stack" data-gap="2">
        <label htmlFor={`editor-${base}`} className="cap-field-label">
          Editor
        </label>
        <input
          id={`editor-${base}`}
          name="editor"
          type="text"
          defaultValue={doc?.editor ?? ""}
          className="cap-input"
        />
      </div>
      <div className="cap-stack" data-gap="2">
        <label htmlFor={`edition-${base}`} className="cap-field-label">
          Meeting
        </label>
        <select
          id={`edition-${base}`}
          name="editionId"
          defaultValue={doc?.editionId ?? ""}
          className="cap-select"
        >
          <option value="">Not linked to a meeting</option>
          {editions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="cap-stack cap-full" data-gap="2">
        <label htmlFor={`slug-${base}`} className="cap-field-label">
          Slug
        </label>
        <input
          id={`slug-${base}`}
          name="slug"
          type="text"
          defaultValue={doc?.slug ?? ""}
          placeholder="fall-1991-newsletter"
          className="cap-input"
        />
        <p className="cap-text cap-muted" data-size="tiny">
          Leave blank on a new document to derive it from the title.
        </p>
      </div>
    </div>
  );
}

export default function AdminDocuments({ loaderData }: Route.ComponentProps) {
  const { documents, editions, filter } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="cap-stack" data-gap="7">
      <header className="cap-stack" data-gap="3">
        <h1 className="cap-title" data-size="2">
          Documents
        </h1>
        <p className="cap-muted">
          Upload and manage the branch's files: newsletters, archived abstract books and programs,
          and brand images. Published PDFs show on the public archive; brand images stay internal to
          the admin.
        </p>
      </header>

      {error ? (
        <p role="alert" className="cap-banner" data-tone="info">
          {error}
        </p>
      ) : null}

      <nav aria-label="Filter by category" className="cap-cluster">
        <Link
          to="/admin/documents"
          className="cap-btn"
          data-size="sm"
          data-variant={filter ? "quiet" : "primary"}
          aria-current={filter ? undefined : "page"}
        >
          All
        </Link>
        {DOCUMENT_CATEGORIES.map((c) => (
          <Link
            key={c}
            to={`/admin/documents?category=${c}`}
            className="cap-btn"
            data-size="sm"
            data-variant={filter === c ? "primary" : "quiet"}
            aria-current={filter === c ? "page" : undefined}
          >
            {DOCUMENT_CATEGORY_LABELS[c]}
          </Link>
        ))}
      </nav>

      {documents.length === 0 ? (
        <p className="cap-muted">No documents yet. Upload the first below.</p>
      ) : (
        <ul className="cap-stack" data-gap="4">
          {documents.map((doc) => (
            <li key={doc.id} className="cap-panel">
              <div className="cap-panel-body cap-stack" data-gap="4">
                <div className="cap-spread">
                  <div className="cap-cluster cap-shrink" data-align="start">
                    {doc.fileKind === "image" && doc.hasFile ? (
                      <img src={`/documents/${doc.slug}/inline`} alt="" className="logo-thumb" />
                    ) : null}
                    <div className="cap-shrink">
                      <p className="cap-text" data-weight="strong">
                        {doc.title}
                      </p>
                      <p className="cap-text cap-muted" data-size="small">
                        {[
                          DOCUMENT_CATEGORY_LABELS[doc.category],
                          doc.status === "published" ? "Published" : "Draft",
                          doc.source === "generated" ? "Generated" : "Uploaded",
                          doc.hasFile ? "" : "No file",
                        ]
                          .filter((p) => p.length > 0)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="cap-cluster">
                    {doc.status === "published" ? (
                      <a
                        href={`/documents/${doc.slug}/inline`}
                        target="_blank"
                        rel="noreferrer"
                        className="cap-text"
                        data-size="small"
                        data-weight="strong"
                      >
                        View
                        <span className="cap-sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : null}
                    <Form method="post">
                      <input type="hidden" name="intent" value="remove" />
                      <input type="hidden" name="documentId" value={doc.id} />
                      <button
                        type="submit"
                        onClick={(e) =>
                          confirmSubmit(e, {
                            title: `Remove ${doc.title}?`,
                            action: "Remove document",
                          })
                        }
                        className="cap-btn"
                        data-variant="link"
                      >
                        Remove
                      </button>
                    </Form>
                  </div>
                </div>

                <Disclosure summary="Edit details" variant="card" size="sm" marker="triangle">
                  <Form method="post" className="cap-stack" data-gap="4" noValidate>
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="documentId" value={doc.id} />
                    <MetaFields doc={doc} editions={editions} />
                    <label className="cap-check">
                      <input
                        type="checkbox"
                        name="publish"
                        defaultChecked={doc.status === "published"}
                      />
                      Published
                    </label>
                    <button type="submit" disabled={submitting} className="cap-btn">
                      Save details
                    </button>
                  </Form>
                </Disclosure>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Panel title="Upload a document" headingId="upload-heading">
        <Form method="post" encType="multipart/form-data" className="cap-stack" noValidate>
          <input type="hidden" name="intent" value="create" />
          <MetaFields editions={editions} />
          <div className="cap-stack" data-gap="2">
            <label htmlFor="file" className="cap-field-label">
              File
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept={UPLOAD_ACCEPT}
              required
              className="cap-input"
            />
            <p className="cap-text cap-muted" data-size="tiny">
              PDF for newsletters, abstract books, and programs; PNG, JPEG, WebP, GIF, or SVG for
              brand images. Up to 50 MB for PDFs, 5 MB for images.
            </p>
          </div>
          <label className="cap-check">
            <input type="checkbox" name="publish" defaultChecked />
            Publish immediately
          </label>
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Uploading..." : "Upload document"}
          </button>
        </Form>
      </Panel>
    </div>
  );
}
