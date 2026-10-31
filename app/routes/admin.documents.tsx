import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.documents";
import { cloudflareContext } from "~/load-context";
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
import { privateMeta } from "~/lib/site-meta";
import { parseYear, readForm } from "~/lib/form.server";

// File picker hint: allow every accepted type so images are selectable for the
// brand_image category. The real gate is the per-category MIME check in the
// action; accept only filters the OS dialog.
const UPLOAD_ACCEPT = [PDF_MIME_TYPE, ...IMAGE_MIME_TYPES].join(",");

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Documents");
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

export async function action({ request, context }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  // The largest file (a 50 MB PDF, vocab.ts) plus room for the form around it.
  const form = await readForm(request, maxUploadBytesForKind("pdf") + 1024 * 1024);
  const intent = String(form.get("intent") ?? "");

  try {
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

    if (intent === "create") {
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        throw new ValidationError("Choose a file to upload.");
      }
      const category = toCategory(String(form.get("category") ?? ""));
      if (!category) {
        throw new ValidationError("Choose a valid document category.");
      }
      // Validate the declared MIME server-side against what the category accepts
      // (PDF for publications, images for brand_image), not the file extension.
      const mime = file.type;
      if (!mime || !allowedMimeTypesForCategory(category).includes(mime)) {
        throw new ValidationError(
          isImageCategory(category)
            ? "Brand images must be a PNG, JPEG, WebP, GIF, or SVG file."
            : "The file must be a PDF.",
        );
      }
      const maxBytes = maxUploadBytesForKind(fileKindForMime(mime));
      if (file.size > maxBytes) {
        const mb = Math.round(maxBytes / (1024 * 1024));
        throw new ValidationError(`The file must be ${mb} MB or smaller.`);
      }
      // Create the metadata row first so slug validation runs before the R2 write,
      // then store the object under a stable key and record it. The stored MIME
      // sets fileKind in the data layer, so the viewer branches on the real type.
      const created = await da.documents.create(actor, {
        category,
        title: String(form.get("title") ?? ""),
        year: parseYear(form.get("year")),
        season: seasonValue(form.get("season")),
        editionId: optionalId(form.get("editionId")),
        editor: optionalText(form.get("editor")),
        slug: optionalText(form.get("slug")),
        fileName: file.name || undefined,
        mimeType: mime,
      });
      const r2Key = `documents/${created.id}.${extensionForMime(mime)}`;
      await env.UPLOADS.put(r2Key, await file.arrayBuffer(), {
        httpMetadata: { contentType: mime },
      });
      await da.documents.update(actor, created.id, { r2Key });
      if (form.get("publish")) {
        await da.documents.publish(actor, created.id);
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
    <div className="grid-2">
      <div className="stack-1">
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
      <div className="stack-1">
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
      <div className="stack-1">
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
      <div className="stack-1">
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
      <div className="stack-1">
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
      <div className="stack-1">
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
      <div className="stack-1 span-2">
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
        <p className="tiny cap-muted">Leave blank on a new document to derive it from the title.</p>
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
    <div className="stack-8">
      <header className="stack-2">
        <h1 className="page-title">Documents</h1>
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

      <nav aria-label="Filter by category" className="cluster">
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
        <ul className="stack-3">
          {documents.map((doc) => (
            <li key={doc.id} className="card stack-3">
              <div className="spread">
                <div className="cluster cluster-start shrink">
                  {doc.fileKind === "image" && doc.hasFile ? (
                    <img src={`/documents/${doc.slug}/inline`} alt="" className="logo-thumb" />
                  ) : null}
                  <div className="shrink">
                    <p className="strong">{doc.title}</p>
                    <p className="small cap-muted">
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
                <div className="cluster">
                  {doc.status === "published" ? (
                    <a
                      href={`/documents/${doc.slug}/inline`}
                      target="_blank"
                      rel="noreferrer"
                      className="small strong"
                    >
                      View
                    </a>
                  ) : null}
                  <Form method="post">
                    <input type="hidden" name="intent" value="remove" />
                    <input type="hidden" name="documentId" value={doc.id} />
                    <button
                      type="submit"
                      onClick={(e) => {
                        if (!window.confirm(`Remove ${doc.title}?`)) {
                          e.preventDefault();
                        }
                      }}
                      className="small strong"
                    >
                      Remove
                    </button>
                  </Form>
                </div>
              </div>

              <details className="card card-s">
                <summary className="summary">Edit details</summary>
                <Form method="post" className="stack-3 mt-3" noValidate>
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
              </details>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="upload-heading" className="card stack-4">
        <h2 id="upload-heading" className="subsection-title">
          Upload a document
        </h2>
        <Form method="post" encType="multipart/form-data" className="stack-4" noValidate>
          <input type="hidden" name="intent" value="create" />
          <MetaFields editions={editions} />
          <div className="stack-1">
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
            <p className="tiny cap-muted">
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
      </section>
    </div>
  );
}
