import { type DragEvent, useEffect, useRef, useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.book";
import { cloudflareContext } from "~/load-context";
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

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Abstract book builder | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const book = await da.books.get(actor, params.editionId);
  const pdf = await da.documents.getGeneratedForEdition(
    actor,
    params.editionId,
    "abstract_book",
  );
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
  const form = await request.formData();
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
      const outcome = await publishArrangedBook(env, da, actor, editionId);
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
  // whenever a builder mutation resolves.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "book" in fetcher.data) {
      const next = (fetcher.data as { book?: BookView }).book;
      if (next) setBook(next);
    }
  }, [fetcher.state, fetcher.data]);

  // The interim PDF Form triggers a loader revalidation; adopt the reloaded book.
  useEffect(() => {
    setBook(loaderData.book);
  }, [loaderData.book]);

  const fetcherMsg =
    fetcher.data && "error" in fetcher.data
      ? (fetcher.data as { error?: string }).error
      : fetcher.data && "ok" in fetcher.data
        ? (fetcher.data as { ok?: string }).ok
        : null;
  const fetcherError = Boolean(
    fetcher.data && "error" in fetcher.data && fetcher.data.error,
  );
  useEffect(() => {
    if (fetcherMsg) statusRef.current?.focus();
  }, [fetcherMsg]);

  const busy = fetcher.state !== "idle";
  const published = book?.status === "published";
  const editable = Boolean(book) && !published;

  function submitReorder(nextSections: BookSectionView[]) {
    if (!book) return;
    setBook({ ...book, sections: nextSections });
    fetcher.submit(
      {
        intent: "reorder",
        arrangement: JSON.stringify(arrangementFrom(nextSections)),
      },
      { method: "post" },
    );
  }

  function onDropOnEntry(
    targetSectionId: string,
    targetIndex: number,
    event: DragEvent,
  ) {
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

  function nudge(
    section: BookSectionView,
    index: number,
    direction: -1 | 1,
  ) {
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
    fetcher.submit({ intent: "setIncluded", entryId, included: String(included) }, { method: "post" });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Abstract book builder</h1>
        <p className="text-gray-700 dark:text-gray-300">
          {edition.name}.{" "}
          <Link
            to={`/admin/editions/${edition.id}`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Edit meeting
          </Link>
        </p>
        <p className="text-gray-600 dark:text-gray-400">
          Generate a draft from the accepted abstracts, drag abstracts within and
          between sections to arrange them, then publish. Codes reflow live and
          freeze on publish.
        </p>
      </div>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={fetcherError ? "alert" : "status"}
        className={
          fetcherError
            ? "rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            : fetcherMsg
              ? "rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
              : "sr-only"
        }
      >
        {fetcherMsg ?? ""}
      </p>

      {!book ? (
        <section className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-gray-700 dark:text-gray-300">
            No book yet. Generate one from the accepted abstracts to start
            arranging.
          </p>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="generate" />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
            >
              {busy ? "Generating..." : "Generate draft book"}
            </button>
          </fetcher.Form>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded border border-gray-200 p-3 dark:border-gray-800">
            <span
              className={
                published
                  ? "rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-200"
              }
            >
              {published ? "Published" : "Draft"}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {book.includedCount} included
              {book.publishedAt
                ? ` . published ${formatDateTime(book.publishedAt)}`
                : ""}
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-3">
              <a
                href={`/admin/editions/${edition.id}/book/preview`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                Open preview
              </a>
              {published ? (
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="reopen" />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
                  >
                    Reopen to edit
                  </button>
                </fetcher.Form>
              ) : (
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="publish" />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
                  >
                    Publish
                  </button>
                </fetcher.Form>
              )}
              <fetcher.Form
                method="post"
                onSubmit={(e) => {
                  if (
                    !confirm(
                      "Regenerate rebuilds the arrangement from the accepted abstracts and discards manual ordering. Continue?",
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="generate" />
                <button
                  type="submit"
                  disabled={busy || published}
                  title={
                    published ? "Reopen the book before regenerating." : undefined
                  }
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
                >
                  Regenerate
                </button>
              </fetcher.Form>
            </span>
          </div>

          {published ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This book is published and its codes are frozen. Reopen it to edit
              the arrangement.
            </p>
          ) : null}

          <div className="space-y-5">
            {book.sections.length === 0 ? (
              <p className="text-gray-700 dark:text-gray-300">
                No sections. There may be no accepted abstracts for this meeting
                yet.
              </p>
            ) : (
              book.sections.map((section) => (
                <section
                  key={section.sectionId}
                  onDragOver={(e) => {
                    if (editable) e.preventDefault();
                  }}
                  onDrop={(e) => onDropOnSection(section.sectionId, e)}
                  className="rounded border border-gray-200 p-3 dark:border-gray-800"
                >
                  <h2 className="mb-2 text-lg font-medium">{section.title}</h2>
                  <ul className="space-y-2">
                    {section.entries.map((entry, index) => (
                      <li
                        key={entry.entryId}
                        draggable={editable}
                        onDragStart={() => setDragId(entry.entryId)}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={(e) => {
                          if (editable) e.preventDefault();
                        }}
                        onDrop={(e) => onDropOnEntry(section.sectionId, index, e)}
                        className={`flex flex-wrap items-center gap-2 rounded border p-2 text-sm ${
                          entry.included
                            ? "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
                            : "border-dashed border-gray-300 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-950"
                        } ${editable ? "cursor-grab" : ""}`}
                      >
                        <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-gray-600 dark:text-gray-400">
                          {entry.code ?? "-"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="font-medium"
                            // Title is stored sanitized (em/sup/sub only).
                            dangerouslySetInnerHTML={{ __html: entry.title }}
                          />
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {entry.presentingAuthorName ?? "No presenter"}
                            {entry.levelLabel ? ` . ${entry.levelLabel}` : ""}
                            {entry.formatLabel ? ` . ${entry.formatLabel}` : ""}
                          </span>
                        </span>
                        {editable ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label="Move up"
                              disabled={busy || index === 0}
                              onClick={() => nudge(section, index, -1)}
                              className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-panel disabled:opacity-30"
                            >
                              {"↑"}
                            </button>
                            <button
                              type="button"
                              aria-label="Move down"
                              disabled={busy || index === section.entries.length - 1}
                              onClick={() => nudge(section, index, 1)}
                              className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-panel disabled:opacity-30"
                            >
                              {"↓"}
                            </button>
                            <label className="sr-only" htmlFor={`move-${entry.entryId}`}>
                              Move to section
                            </label>
                            <select
                              id={`move-${entry.entryId}`}
                              value={section.sectionId}
                              disabled={busy}
                              onChange={(e) =>
                                moveToSection(entry.entryId, e.target.value)
                              }
                              className="max-w-[10rem] rounded border border-border bg-transparent px-1 py-0.5 text-xs"
                            >
                              {book.sections.map((s) => (
                                <option key={s.sectionId} value={s.sectionId}>
                                  {s.title}
                                </option>
                              ))}
                            </select>
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={entry.included}
                                disabled={busy}
                                onChange={(e) =>
                                  toggleIncluded(entry.entryId, e.target.checked)
                                }
                              />
                              In
                            </label>
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-gray-500">
                            {entry.included ? "" : "Excluded"}
                          </span>
                        )}
                      </li>
                    ))}
                    {section.entries.length === 0 ? (
                      <li className="rounded border border-dashed border-gray-300 p-2 text-xs text-gray-500 dark:border-gray-700">
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
          delivered through the document/R2 path. Publish it to the public archive. */}
      <section className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-lg font-medium">Book PDF</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          The PDF is produced from the arranged book when you publish, via Browser
          Rendering. Publish it to the archive to make it public.
        </p>
        {!pdf ? (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            No PDF yet. Publish the book to produce it.
          </p>
        ) : pdf.genStatus === "ready" ? (
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium text-green-700 dark:text-green-400">
                Ready
              </span>
              {pdf.generatedAt ? ` . ${formatDateTime(pdf.generatedAt)}` : ""}
              {typeof pdf.abstractCount === "number"
                ? ` . ${pdf.abstractCount} abstracts`
                : ""}
            </p>
            <p>
              <a
                href={`/admin/editions/${edition.id}/book/download`}
                className="font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                Download the PDF
              </a>
            </p>
            <p>
              {pdf.status === "published" ? (
                <span className="font-medium text-green-700 dark:text-green-400">
                  Published to the archive
                </span>
              ) : (
                <Form method="post" className="inline">
                  <input type="hidden" name="intent" value="pdf-publish" />
                  <input type="hidden" name="documentId" value={pdf.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-border px-2 py-1 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Publish to archive
                  </button>
                </Form>
              )}
            </p>
          </div>
        ) : pdf.genStatus === "generating" ? (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            The PDF is rendering. Refresh in a minute.
          </p>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            The PDF is pending Browser Rendering (Workers plan). The book is
            published and its HTML preview is available above.
          </p>
        )}
      </section>
    </div>
  );
}
