import { Stack } from "capsomer/react/stack";
import { Field, TextField } from "capsomer/react/field";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Panel } from "capsomer/react/panel";
import { Disclosure } from "capsomer/react/disclosure";
import { ButtonLink } from "capsomer/react/link";
import type { Route } from "./+types/admin.documents";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireAdmin } from "~/lib/auth.server";
import { getDataAccess } from "~/lib/data-access";
import {
  createDocument,
  optionalId,
  optionalText,
  seasonValue,
  toCategory,
} from "~/lib/document-upload.server";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  IMAGE_MIME_TYPES,
  PDF_MIME_TYPE,
  SEASONS,
  SEASON_LABELS,
  type DocumentCategory,
} from "~/lib/vocab";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { readForm } from "@dustinedwards/site-runtime/body";
import { formError, parseYear, FORM_LIMIT } from "~/lib/form.server";
import { multipartBoundary } from "@dustinedwards/site-runtime/body";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";

// Only filters the OS dialog; the per-category MIME check in the action is the gate.
const UPLOAD_ACCEPT = [PDF_MIME_TYPE, ...IMAGE_MIME_TYPES].join(",");

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Documents"));
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
      const category = String(form.get("category") ?? "") as DocumentCategory;
      await da.documents.update(actor, id, {
        category,
        title: String(form.get("title") ?? ""),
        year: parseYear(form.get("year")),
        season: seasonValue(form.get("season")),
        editionId: optionalId(form.get("editionId")),
        editor: optionalText(form.get("editor")),
        slug: optionalText(form.get("slug")),
        status: form.get("publish") && category !== "brand_image" ? "published" : "draft",
      });
      return redirect("/admin/documents");
    }
  } catch (error) {
    return formError(error);
  }

  return { error: "Unknown action." };
}

type Doc = Route.ComponentProps["loaderData"]["documents"][number];
type Edition = Route.ComponentProps["loaderData"]["editions"][number];

function MetaFields({ doc, editions }: { doc?: Doc; editions: Edition[] }) {
  const base = doc ? doc.id : "new";
  return (
    <div className="cap-grid" data-cols="2">
      <TextField
        id={`title-${base}`}
        label="Title"
        name="title"
        type="text"
        required
        defaultValue={doc?.title ?? ""}
      />
      <Field label="Category" id={`category-${base}`}>
        <select name="category" defaultValue={doc?.category ?? "newsletter"} className="cap-select">
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {DOCUMENT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <TextField
        id={`year-${base}`}
        label="Year"
        name="year"
        type="number"
        step="1"
        defaultValue={doc?.year ?? ""}
      />
      <Field label="Season" id={`season-${base}`}>
        <select name="season" defaultValue={doc?.season ?? ""} className="cap-select">
          <option value="">None</option>
          {SEASONS.map((s) => (
            <option key={s} value={s}>
              {SEASON_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>
      <TextField
        id={`editor-${base}`}
        label="Editor"
        name="editor"
        type="text"
        defaultValue={doc?.editor ?? ""}
      />
      <Field label="Meeting" id={`edition-${base}`}>
        <select name="editionId" defaultValue={doc?.editionId ?? ""} className="cap-select">
          <option value="">Not linked to a meeting</option>
          {editions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Stack gap={2} className="span-2">
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
      </Stack>
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
    <Stack gap={7}>
      <Stack as="header" gap={3}>
        <h1 className="page-title">Documents</h1>
      </Stack>

      {error ? (
        <p role="alert" className="cap-banner" data-tone="info">
          {error}
        </p>
      ) : null}

      <nav aria-label="Filter by category" className="cap-cluster">
        <ButtonLink
          to="/admin/documents"
          size="sm"
          variant={filter ? "quiet" : "primary"}
          aria-current={filter ? undefined : "page"}
        >
          All
        </ButtonLink>
        {DOCUMENT_CATEGORIES.map((c) => (
          <ButtonLink
            key={c}
            to={`/admin/documents?category=${c}`}
            size="sm"
            variant={filter === c ? "primary" : "quiet"}
            aria-current={filter === c ? "page" : undefined}
          >
            {DOCUMENT_CATEGORY_LABELS[c]}
          </ButtonLink>
        ))}
      </nav>

      {documents.length === 0 ? (
        <p className="cap-muted">No documents yet.</p>
      ) : (
        <Stack as="ul" gap={4}>
          {documents.map((doc) => (
            <li key={doc.id} className="cap-panel">
              <div className="cap-panel-body cap-stack" data-gap="4">
                <div className="cap-spread">
                  <div className="cap-cluster shrink" data-align="start">
                    {doc.fileKind === "image" && doc.hasFile ? (
                      <img src={`/documents/${doc.slug}/inline`} alt="" className="logo-thumb" />
                    ) : null}
                    <div className="shrink">
                      <p className="strong">{doc.title}</p>
                      <p className="small cap-muted">
                        {[
                          DOCUMENT_CATEGORY_LABELS[doc.category],
                          doc.category === "brand_image"
                            ? "Internal only"
                            : doc.status === "published"
                              ? "Published"
                              : "Draft",
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
                        className="small strong"
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
                        className="small strong"
                      >
                        Remove
                      </button>
                    </Form>
                  </div>
                </div>

                <Disclosure summary="Edit details" variant="card" size="sm" marker="triangle">
                  <Stack as={Form} method="post" noValidate gap={4}>
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
                  </Stack>
                </Disclosure>
              </div>
            </li>
          ))}
        </Stack>
      )}

      <Panel title="Upload a document" headingId="upload-heading">
        <Stack as={Form} method="post" encType="multipart/form-data" noValidate>
          <input type="hidden" name="intent" value="create" />
          <MetaFields editions={editions} />
          <Stack gap={2}>
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
          </Stack>
          <label className="cap-check">
            <input type="checkbox" name="publish" defaultChecked />
            Publish immediately
          </label>
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Uploading..." : "Upload document"}
          </button>
        </Stack>
      </Panel>
    </Stack>
  );
}
