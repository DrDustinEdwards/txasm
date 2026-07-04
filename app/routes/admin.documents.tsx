import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
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
import { pageTitle } from "~/lib/site-meta";

// File picker hint: allow every accepted type so images are selectable for the
// brand_image category. The real gate is the per-category MIME check in the
// action; accept only filters the OS dialog.
const UPLOAD_ACCEPT = [PDF_MIME_TYPE, ...IMAGE_MIME_TYPES].join(",");

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Documents") }];
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

function parseYear(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError("Year must be a whole number.");
  }
  return n;
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
  const form = await request.formData();
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

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const primaryButton =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60";

const secondaryButton =
  "rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60";

type Doc = Route.ComponentProps["loaderData"]["documents"][number];
type Edition = Route.ComponentProps["loaderData"]["editions"][number];

function MetaFields({
  doc,
  editions,
}: {
  doc?: Doc;
  editions: Edition[];
}) {
  const base = doc ? doc.id : "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label htmlFor={`title-${base}`} className="block text-sm font-medium text-text">
          Title
        </label>
        <input
          id={`title-${base}`}
          name="title"
          type="text"
          required
          defaultValue={doc?.title ?? ""}
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`category-${base}`} className="block text-sm font-medium text-text">
          Category
        </label>
        <select
          id={`category-${base}`}
          name="category"
          defaultValue={doc?.category ?? "newsletter"}
          className={inputClass}
        >
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {DOCUMENT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={`year-${base}`} className="block text-sm font-medium text-text">
          Year
        </label>
        <input
          id={`year-${base}`}
          name="year"
          type="number"
          step="1"
          defaultValue={doc?.year ?? ""}
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`season-${base}`} className="block text-sm font-medium text-text">
          Season
        </label>
        <select
          id={`season-${base}`}
          name="season"
          defaultValue={doc?.season ?? ""}
          className={inputClass}
        >
          <option value="">None</option>
          {SEASONS.map((s) => (
            <option key={s} value={s}>
              {SEASON_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={`editor-${base}`} className="block text-sm font-medium text-text">
          Editor
        </label>
        <input
          id={`editor-${base}`}
          name="editor"
          type="text"
          defaultValue={doc?.editor ?? ""}
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`edition-${base}`} className="block text-sm font-medium text-text">
          Meeting
        </label>
        <select
          id={`edition-${base}`}
          name="editionId"
          defaultValue={doc?.editionId ?? ""}
          className={inputClass}
        >
          <option value="">Not linked to a meeting</option>
          {editions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={`slug-${base}`} className="block text-sm font-medium text-text">
          Slug
        </label>
        <input
          id={`slug-${base}`}
          name="slug"
          type="text"
          defaultValue={doc?.slug ?? ""}
          placeholder="fall-1991-newsletter"
          className={inputClass}
        />
        <p className="text-xs text-text-muted">
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

  const filterClass = (active: boolean) =>
    active
      ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      : "rounded-md px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-panel hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-text">Documents</h1>
        <p className="text-text-muted">
          Upload and manage the branch's files: newsletters, archived abstract
          books and programs, and brand images. Published PDFs show on the public
          archive; brand images stay internal to the admin.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm text-text"
        >
          {error}
        </p>
      ) : null}

      <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
        <Link to="/admin/documents" className={filterClass(!filter)}>
          All
        </Link>
        {DOCUMENT_CATEGORIES.map((c) => (
          <Link
            key={c}
            to={`/admin/documents?category=${c}`}
            className={filterClass(filter === c)}
          >
            {DOCUMENT_CATEGORY_LABELS[c]}
          </Link>
        ))}
      </nav>

      {documents.length === 0 ? (
        <p className="text-text-muted">No documents yet. Upload the first below.</p>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="space-y-3 rounded-lg border border-border bg-surface-raised p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {doc.fileKind === "image" && doc.hasFile ? (
                    <img
                      src={`/documents/${doc.slug}/inline`}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded border border-border bg-surface object-contain p-1"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-medium text-text">{doc.title}</p>
                    <p className="text-sm text-text-muted">
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
                <div className="flex items-center gap-3">
                  {doc.status === "published" ? (
                    <a
                      href={`/documents/${doc.slug}/inline`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
                      className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      Remove
                    </button>
                  </Form>
                </div>
              </div>

              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium text-text">
                  Edit details
                </summary>
                <Form method="post" className="mt-3 space-y-3" noValidate>
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="documentId" value={doc.id} />
                  <MetaFields doc={doc} editions={editions} />
                  <label className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      name="publish"
                      defaultChecked={doc.status === "published"}
                      className="h-4 w-4"
                    />
                    Published
                  </label>
                  <button type="submit" disabled={submitting} className={secondaryButton}>
                    Save details
                  </button>
                </Form>
              </details>
            </li>
          ))}
        </ul>
      )}

      <section
        aria-labelledby="upload-heading"
        className="space-y-4 rounded-lg border border-border bg-surface-raised p-5"
      >
        <h2 id="upload-heading" className="text-lg font-medium text-text">
          Upload a document
        </h2>
        <Form
          method="post"
          encType="multipart/form-data"
          className="space-y-4"
          noValidate
        >
          <input type="hidden" name="intent" value="create" />
          <MetaFields editions={editions} />
          <div className="space-y-1">
            <label htmlFor="file" className="block text-sm font-medium text-text">
              File
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept={UPLOAD_ACCEPT}
              required
              className={inputClass}
            />
            <p className="text-xs text-text-muted">
              PDF for newsletters, abstract books, and programs; PNG, JPEG, WebP,
              GIF, or SVG for brand images. Up to 50 MB for PDFs, 5 MB for images.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              name="publish"
              defaultChecked
              className="h-4 w-4"
            />
            Publish immediately
          </label>
          <button type="submit" disabled={submitting} className={primaryButton}>
            {submitting ? "Uploading..." : "Upload document"}
          </button>
        </Form>
      </section>
    </div>
  );
}
