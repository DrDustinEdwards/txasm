import { useState } from "react";
import { Panel } from "capsomer/react/panel";
import { Form, useFetcher } from "react-router";
import { ActionResult } from "capsomer/react/message";
import { SortableBoard } from "capsomer/react/sortable-list";
// Capsomer's sortable list styles, loaded with the routes that use it rather than on every page.
import "capsomer/sortable-list.css";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.book";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
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
import { DATE_TIME } from "~/lib/format";
import { formatDate } from "capsomer/behavior/time";
import { richTextPlain } from "capsomer/behavior/rich-text-field";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT } from "~/lib/form.server";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";
import { GeneratedFile } from "capsomer/react/generated-file";
import { Status } from "capsomer/react/status";
import { Time } from "capsomer/react/time";
import { RichText } from "capsomer/react/trusted-html";
import generatedFile from "~/styles/generated-file.css?url";

// Capsomer stylesheets only this page uses, so no other page downloads them (devkit-route-weight counts them).
export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: generatedFile }];

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Abstract book builder"));
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

export default function AbstractBookBuilder({ loaderData }: Route.ComponentProps) {
  const { edition, pdf } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [book, setBook] = useState<BookView | null>(loaderData.book);

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

  const busy = fetcher.state !== "idle";
  // A move is shown at once and saved behind it, so the board stays usable (and the pressed control keeps focus)
  // while it saves; any other save under way disables it.
  const boardBusy = busy && fetcher.formData?.get("intent") !== "reorder";
  const published = book?.status === "published";
  const editable = Boolean(book) && !published;

  // A move on the board: every section's new order, shown at once and saved. The action answers with the
  // reflowed codes, which the book adopts above.
  function submitReorder(lists: Record<string, string[]>) {
    if (!book) return;
    const byId = new Map(book.sections.flatMap((s) => s.entries).map((e) => [e.entryId, e]));
    const sections = book.sections.map((s) => ({
      ...s,
      entries: (lists[s.sectionId] ?? []).flatMap((id) => byId.get(id) ?? []),
    }));
    setBook({ ...book, sections });
    void fetcher.submit(
      { intent: "reorder", arrangement: JSON.stringify(arrangementFrom(sections)) },
      { method: "post" },
    );
  }

  function toggleIncluded(entryId: string, included: boolean) {
    void fetcher.submit(
      { intent: "setIncluded", entryId, included: String(included) },
      { method: "post" },
    );
  }

  return (
    <div className="cap-stack" data-gap="6">
      <div className="cap-stack" data-gap="3">
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

      <ActionResult data={fetcher.data} />

      {!book ? (
        <Panel>
          <div className="cap-stack" data-gap="4">
            <p>No book yet. Generate one from the accepted abstracts to start arranging.</p>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="generate" />
              <button type="submit" disabled={busy} className="cap-btn" data-variant="primary">
                {busy ? "Generating..." : "Generate draft book"}
              </button>
            </fetcher.Form>
          </div>
        </Panel>
      ) : (
        <>
          <Panel size="sm">
            <div className="cap-cluster">
              <span className="cap-badge" data-tone={published ? "ok" : "warn"}>
                {published ? "Published" : "Draft"}
              </span>
              <span className="small cap-muted">
                {book.includedCount} included
                {book.publishedAt ? ` . published ${formatDate(book.publishedAt, DATE_TIME)}` : ""}
              </span>
              <span className="cap-cluster cap-push">
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
          </Panel>

          {published ? (
            <p className="small cap-muted">
              This book is published and its codes are frozen. Reopen it to edit the arrangement.
            </p>
          ) : null}

          {book.sections.length === 0 ? (
            <p>No sections. There may be no accepted abstracts for this meeting yet.</p>
          ) : (
            <SortableBoard
              aria-label="Abstract book sections"
              className="sort-book"
              steps="bordered"
              grip={false}
              itemClassName={(entry) => (entry.included ? undefined : "book-excluded")}
              lanes={book.sections.map((section) => ({
                id: section.sectionId,
                label: section.title,
                items: section.entries,
              }))}
              getId={(entry) => entry.entryId}
              getLabel={(entry) =>
                [entry.code, richTextPlain(entry.title)].filter(Boolean).join(" ")
              }
              readOnly={published}
              busy={boardBusy}
              empty="Empty. Drag an abstract here."
              onMove={submitReorder}
              renderLaneHead={(lane) => <h2 className="subsection-title">{lane.label}</h2>}
              renderControls={(entry) =>
                editable ? (
                  <label className="cap-cluster tiny" data-gap="2">
                    <input
                      type="checkbox"
                      checked={entry.included}
                      disabled={busy}
                      onChange={(e) => toggleIncluded(entry.entryId, e.target.checked)}
                    />
                    In
                  </label>
                ) : null
              }
              renderItem={(entry) => (
                <span className="book-entry">
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
                  {editable ? null : (
                    <span className="tiny cap-muted">{entry.included ? "" : "Excluded"}</span>
                  )}
                </span>
              )}
            />
          )}
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
        generate={false}
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
