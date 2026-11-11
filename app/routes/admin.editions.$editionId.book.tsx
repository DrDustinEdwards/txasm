import { type DragEvent, useEffect, useRef, useState } from "react";
import { Form, useFetcher } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.book";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireChair } from "~/lib/auth.server";
import {
  ValidationError,
  getDataAccess,
  type BookArrangementInput,
  type BookSectionView,
  type BookView,
} from "~/lib/data-access";
import { publishArrangedBook } from "~/lib/book-pdf.server";
import { formatDateTime } from "~/lib/format";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT } from "~/lib/form.server";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";
import { GeneratedFile } from "capsomer/react/generated-file";
import { Status } from "capsomer/react/status";
import { Time } from "capsomer/react/time";
import { RichText } from "capsomer/react/trusted-html";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Abstract book builder");
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const book = await da.books.get(actor, params.editionId);
  const pdf = await da.documents.getGeneratedForEdition(actor, params.editionId, "abstract_book");
  return { edition: { id: edition.id, name: edition.name }, book, pdf };
}

// Generate, arrange, and publish are the builder. publish also produces the
// arranged PDF (best-effort, gated on Browser Rendering) and delivers it through
// the document/R2 path; pdf-publish flips that PDF to public in the archive.
export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const editionId = params.editionId;
  const form = await readForm(request, FORM_LIMIT);
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "generate") {
      const book = await da.books.generate(actor, editionId);
      return { ok: "Draft book generated from the accepted abstracts.", book };
    }
    if (intent === "reorder") {
      const arrangement = JSON.parse(
        String(form.get("arrangement") ?? "{}"),
      ) as BookArrangementInput;
      const book = await da.books.reorder(actor, editionId, arrangement);
      return { book };
    }
    if (intent === "setIncluded") {
      const entryId = String(form.get("entryId") ?? "");
      const included = String(form.get("included") ?? "") === "true";
      const book = await da.books.setIncluded(actor, editionId, entryId, included);
      return { book };
    }
    if (intent === "publish") {
      const outcome = await publishArrangedBook(
        env,
        da,
        actor,
        editionId,
        new URL(request.url).origin,
      );
      const book = await da.books.get(actor, editionId);
      const note =
        outcome === "ready"
          ? " The PDF is ready."
          : outcome === "kept-previous"
            ? " Kept the previous PDF; the new render is pending Browser Rendering."
            : " The PDF is pending Browser Rendering.";
      return { ok: `Book published. Codes are frozen.${note}`, book };
    }
    if (intent === "reopen") {
      const book = await da.books.reopen(actor, editionId);
      return { ok: "Reopened for editing.", book };
    }
    if (intent === "pdf-publish") {
      await da.documents.publish(actor, String(form.get("documentId") ?? ""));
      return { ok: "The abstract book PDF is published." };
    }
    return { error: "Unknown action." };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Client editor
// ---------------------------------------------------------------------------

function arrangementFrom(sections: BookSectionView[]): BookArrangementInput {
  return {
    sections: sections.map((s) => ({
      sectionId: s.sectionId,
      entryIds: s.entries.map((e) => e.entryId),
    })),
  };
}

function moveEntry(
  sections: BookSectionView[],
  entryId: string,
  targetSectionId: string,
  targetIndex: number,
): BookSectionView[] {
  let moved: BookSectionView["entries"][number] | undefined;
  const stripped = sections.map((s) => {
    const idx = s.entries.findIndex((e) => e.entryId === entryId);
    if (idx < 0) return s;
    moved = s.entries[idx];
    return { ...s, entries: s.entries.filter((e) => e.entryId !== entryId) };
  });
  if (!moved) return sections;
  const entry = moved;
  return stripped.map((s) => {
    if (s.sectionId !== targetSectionId) return s;
    const entries = [...s.entries];
    const clamped = Math.max(0, Math.min(targetIndex, entries.length));
    entries.splice(clamped, 0, entry);
    return { ...s, entries };
  });
}

export default function AbstractBookBuilder({ loaderData }: Route.ComponentProps) {
  const { edition, pdf } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [book, setBook] = useState<BookView | null>(loaderData.book);
  const [dragId, setDragId] = useState<string | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  // The action returns the authoritative BookView (with reflowed codes); adopt it
  // whenever a builder mutation resolves. Adjusted while rendering, not in an
  // effect, so the stale book never paints
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [adoptedData, setAdoptedData] = useState(fetcher.data);
  if (fetcher.state === "idle" && fetcher.data !== adoptedData) {
    setAdoptedData(fetcher.data);
    const next =
      fetcher.data && "book" in fetcher.data
        ? (fetcher.data as { book?: BookView }).book
        : undefined;
    if (next) setBook(next);
  }

  // The interim PDF Form triggers a loader revalidation; adopt the reloaded book.
  const [adoptedLoaderBook, setAdoptedLoaderBook] = useState(loaderData.book);
  if (loaderData.book !== adoptedLoaderBook) {
    setAdoptedLoaderBook(loaderData.book);
    setBook(loaderData.book);
  }

  const fetcherMsg =
    fetcher.data && "error" in fetcher.data
      ? (fetcher.data as { error?: string }).error
      : fetcher.data && "ok" in fetcher.data
        ? (fetcher.data as { ok?: string }).ok
        : null;
  const fetcherError = Boolean(fetcher.data && "error" in fetcher.data && fetcher.data.error);
  useEffect(() => {
    if (fetcherMsg) statusRef.current?.focus();
  }, [fetcherMsg]);

  const busy = fetcher.state !== "idle";
  const published = book?.status === "published";
  const editable = Boolean(book) && !published;

  function submitReorder(nextSections: BookSectionView[]) {
    if (!book) return;
    setBook({ ...book, sections: nextSections });
    void fetcher.submit(
      {
        intent: "reorder",
        arrangement: JSON.stringify(arrangementFrom(nextSections)),
      },
      { method: "post" },
    );
  }

  function onDropOnEntry(targetSectionId: string, targetIndex: number, event: DragEvent) {
    event.preventDefault();
    if (!book || !dragId || !editable) return;
    submitReorder(moveEntry(book.sections, dragId, targetSectionId, targetIndex));
    setDragId(null);
  }

  function onDropOnSection(targetSectionId: string, event: DragEvent) {
    event.preventDefault();
    if (!book || !dragId || !editable) return;
    const target = book.sections.find((s) => s.sectionId === targetSectionId);
    const end = target ? target.entries.length : 0;
    submitReorder(moveEntry(book.sections, dragId, targetSectionId, end));
    setDragId(null);
  }

  function nudge(section: BookSectionView, index: number, direction: -1 | 1) {
    if (!book) return;
    const target = index + direction;
    if (target < 0 || target >= section.entries.length) return;
    submitReorder(
      moveEntry(book.sections, section.entries[index].entryId, section.sectionId, target),
    );
  }

  function moveToSection(entryId: string, targetSectionId: string) {
    if (!book) return;
    const target = book.sections.find((s) => s.sectionId === targetSectionId);
    submitReorder(
      moveEntry(book.sections, entryId, targetSectionId, target ? target.entries.length : 0),
    );
  }

  function toggleIncluded(entryId: string, included: boolean) {
    void fetcher.submit(
      { intent: "setIncluded", entryId, included: String(included) },
      { method: "post" },
    );
  }

  return (
    <div className="stack-6">
      <div className="stack-2">
        <h1 className="page-title">Abstract book builder</h1>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}`} className="strong">
            Edit meeting
          </Link>
        </p>
        <p className="cap-muted">
          Generate a draft from the accepted abstracts, drag abstracts within and between sections
          to arrange them, then publish. Codes reflow live and freeze on publish.
        </p>
      </div>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={fetcherError ? "alert" : "status"}
        className={fetcherError || fetcherMsg ? "cap-alert" : "cap-sr-only"}
        data-tone={fetcherError ? "crit" : "ok"}
      >
        {fetcherMsg ?? ""}
      </p>

      {!book ? (
        <section className="card stack-3">
          <p>No book yet. Generate one from the accepted abstracts to start arranging.</p>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="generate" />
            <button type="submit" disabled={busy} className="cap-btn" data-variant="primary">
              {busy ? "Generating..." : "Generate draft book"}
            </button>
          </fetcher.Form>
        </section>
      ) : (
        <>
          <div className="card card-s cluster">
            <span className="cap-badge" data-tone={published ? "ok" : "warn"}>
              {published ? "Published" : "Draft"}
            </span>
            <span className="small cap-muted">
              {book.includedCount} included
              {book.publishedAt ? ` . published ${formatDateTime(book.publishedAt)}` : ""}
            </span>
            <span className="cluster push-end">
              <a
                href={`/admin/editions/${edition.id}/book/preview`}
                target="_blank"
                rel="noreferrer"
                className="small strong"
              >
                Open preview
                <span className="cap-sr-only"> (opens in a new tab)</span>
              </a>
              {published ? (
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="reopen" />
                  <button type="submit" disabled={busy} className="cap-btn" data-size="sm">
                    Reopen to edit
                  </button>
                </fetcher.Form>
              ) : (
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="publish" />
                  <button
                    type="submit"
                    disabled={busy}
                    className="cap-btn"
                    data-variant="primary"
                    data-size="sm"
                  >
                    Publish
                  </button>
                </fetcher.Form>
              )}
              <fetcher.Form
                method="post"
                onSubmit={(e) =>
                  confirmSubmit(e, {
                    title: "Regenerate the book?",
                    lead: "This rebuilds the arrangement from the accepted abstracts and discards manual ordering.",
                    action: "Regenerate",
                  })
                }
              >
                <input type="hidden" name="intent" value="generate" />
                <button
                  type="submit"
                  disabled={busy || published}
                  title={published ? "Reopen the book before regenerating." : undefined}
                  className="cap-btn"
                  data-size="sm"
                >
                  Regenerate
                </button>
              </fetcher.Form>
            </span>
          </div>

          {published ? (
            <p className="small cap-muted">
              This book is published and its codes are frozen. Reopen it to edit the arrangement.
            </p>
          ) : null}

          <div className="stack-4">
            {book.sections.length === 0 ? (
              <p>No sections. There may be no accepted abstracts for this meeting yet.</p>
            ) : (
              book.sections.map((section) => (
                <section
                  key={section.sectionId}
                  onDragOver={(e) => {
                    if (editable) e.preventDefault();
                  }}
                  onDrop={(e) => onDropOnSection(section.sectionId, e)}
                  className="card card-s"
                >
                  <h2 className="subsection-title">{section.title}</h2>
                  <ul className="stack-2">
                    {section.entries.map((entry, index) => (
                      // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drag to reorder is the pointer path; the Move up and Move down buttons are the keyboard one
                      <li
                        key={entry.entryId}
                        draggable={editable}
                        onDragStart={() => setDragId(entry.entryId)}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={(e) => {
                          if (editable) e.preventDefault();
                        }}
                        onDrop={(e) => onDropOnEntry(section.sectionId, index, e)}
                        className="book-entry"
                        data-excluded={entry.included ? undefined : ""}
                        data-draggable={editable ? "" : undefined}
                      >
                        <span className="tiny cap-muted cap-num time-col">{entry.code ?? "-"}</span>
                        <span className="grow">
                          {/* Title is stored sanitized (em/sup/sub only). */}
                          <RichText as="span" className="strong" html={entry.title} />
                          <span className="tiny cap-muted block">
                            {entry.presentingAuthorName ?? "No presenter"}
                            {entry.levelLabel ? ` . ${entry.levelLabel}` : ""}
                            {entry.formatLabel ? ` . ${entry.formatLabel}` : ""}
                          </span>
                        </span>
                        {editable ? (
                          <span className="cluster cluster-tight">
                            <button
                              type="button"
                              aria-label="Move up"
                              disabled={busy || index === 0}
                              onClick={() => nudge(section, index, -1)}
                              className="cap-btn"
                              data-size="sm"
                            >
                              {"↑"}
                            </button>
                            <button
                              type="button"
                              aria-label="Move down"
                              disabled={busy || index === section.entries.length - 1}
                              onClick={() => nudge(section, index, 1)}
                              className="cap-btn"
                              data-size="sm"
                            >
                              {"↓"}
                            </button>
                            <label className="cap-sr-only" htmlFor={`move-${entry.entryId}`}>
                              Move to section
                            </label>
                            <select
                              id={`move-${entry.entryId}`}
                              value={section.sectionId}
                              disabled={busy}
                              onChange={(e) => moveToSection(entry.entryId, e.target.value)}
                              className="cap-select"
                              data-size="sm"
                            >
                              {book.sections.map((s) => (
                                <option key={s.sectionId} value={s.sectionId}>
                                  {s.title}
                                </option>
                              ))}
                            </select>
                            <label className="cluster cluster-tight tiny">
                              <input
                                type="checkbox"
                                checked={entry.included}
                                disabled={busy}
                                onChange={(e) => toggleIncluded(entry.entryId, e.target.checked)}
                              />
                              In
                            </label>
                          </span>
                        ) : (
                          <span className="tiny cap-muted">{entry.included ? "" : "Excluded"}</span>
                        )}
                      </li>
                    ))}
                    {section.entries.length === 0 ? (
                      <li className="card card-s card-dashed tiny cap-muted">
                        Empty. Drag an abstract here.
                      </li>
                    ) : null}
                  </ul>
                </section>
              ))
            )}
          </div>
        </>
      )}

      {/* The published book's PDF, produced on publish via Browser Rendering and
          delivered through the document/R2 path. Publishing the book is what makes
          it, so the panel has no Generate button. Publish it to the public archive. */}
      <GeneratedFile
        title="Book PDF"
        description="The PDF is produced from the arranged book when you publish, via Browser Rendering. Publish it to the archive to make it public."
        record={pdf?.record}
        downloadHref={`/admin/editions/${edition.id}/book/download`}
        renderForm={() => null}
        messages={{
          none: "Publish the book to produce it.",
          generating: "The PDF is rendering. Refresh in a minute.",
          failed:
            "The PDF is pending Browser Rendering (Workers plan). The book is published and its HTML preview is available above.",
          ...(pdf?.generatedAt && typeof pdf.abstractCount === "number"
            ? {
                ready: (
                  <>
                    Made <Time at={pdf.generatedAt} format="exact" />, {pdf.abstractCount}{" "}
                    abstracts.
                  </>
                ),
              }
            : {}),
        }}
      >
        {pdf?.record.generatedAt ? (
          pdf.status === "published" ? (
            <Status tone="ok">Published to the archive</Status>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="pdf-publish" />
              <input type="hidden" name="documentId" value={pdf.id} />
              <button type="submit" className="cap-btn">
                Publish to archive
              </button>
            </Form>
          )
        ) : null}
      </GeneratedFile>
    </div>
  );
}
