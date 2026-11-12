// Server-only: render the arranged abstract book HTML to a PDF with Browser
// Rendering (the BROWSER binding), through site-runtime's pagedPdf and the site's
// own @cloudflare/puppeteer, and the publish orchestration that produces and stores
// it. It reaches env bindings (BROWSER, BOOKS) and drives the data-access layer,
// which is why the publish orchestration lives here in a *.server module and not
// inside the data boundary (books.publish has no env and only freezes codes +
// stores the HTML).

import puppeteer from "@cloudflare/puppeteer";
import { pagedPdf } from "@dustinedwards/site-runtime/print-pdf";
import { renderArrangedBook } from "./book";
import type { Actor, DataAccess } from "./data-access";
import { PDF_MIME_TYPE } from "./vocab";

// The PDF outcome of a publish: the new arranged PDF was produced, the previous
// PDF was kept because the new render could not run, or no PDF is available yet
// and one is pending Browser Rendering.
export type PublishPdfOutcome = "ready" | "kept-previous" | "pending";

// Publish a book: freeze its codes and store the arranged HTML (always, through
// the data boundary), then best-effort produce the arranged PDF and deliver it
// through the existing document/R2 path. Browser Rendering is gated on the
// Workers plan, so the PDF is never allowed to fail the publish: if it cannot
// render, the frozen HTML stands and the PDF is reported pending. A failed
// re-render keeps the previously ready PDF downloadable.
export async function publishArrangedBook(
  env: Env,
  da: DataAccess,
  actor: Actor,
  editionId: string,
  origin: string,
): Promise<PublishPdfOutcome> {
  const data = await da.books.renderData(actor, editionId);
  const html = renderArrangedBook(data);
  // Freeze codes + store the frozen render. This must succeed for a publish.
  await da.books.publish(actor, editionId, html);

  // Best-effort arranged PDF through the same delivery path the archive reads.
  const prior = await da.documents.getGeneratedForEdition(actor, editionId, "abstract_book");
  let claimId: string;
  try {
    const claim = await da.documents.recordGenerating(actor, {
      editionId,
      category: "abstract_book",
    });
    claimId = claim.id;
  } catch {
    // A concurrent generation holds the slot; the HTML is already frozen.
    return "pending";
  }

  try {
    // `origin` is the site's: the book names Paged.js and its fonts by path, and the page the
    // browser opens has no address of its own, so pagedPdf's <base> resolves them against the site.
    const bytes = await pagedPdf(puppeteer, env.BROWSER, html, {
      origin,
      what: "the abstract book",
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const r2Key = `editions/${editionId}/abstract-book-${stamp}.pdf`;
    const season = data.edition.season;
    const fileName = `TXASM ${season.charAt(0).toUpperCase()}${season.slice(1)} ${data.edition.year} Abstract Book.pdf`;
    await env.BOOKS.put(r2Key, bytes, {
      httpMetadata: { contentType: PDF_MIME_TYPE },
    });
    await da.documents.recordReady(actor, claimId, {
      r2Key,
      fileName,
      abstractCount: data.entryCount,
    });
    return "ready";
  } catch (error) {
    console.error("[book] arranged pdf render failed", error);
    // Keep a previously ready PDF downloadable rather than breaking the archive.
    if (prior && prior.genStatus === "ready" && prior.r2Key) {
      await da.documents.recordReady(actor, claimId, {
        r2Key: prior.r2Key,
        fileName: prior.fileName ?? "abstract-book.pdf",
        abstractCount: prior.abstractCount ?? undefined,
      });
      return "kept-previous";
    }
    await da.documents.recordFailed(actor, claimId);
    return "pending";
  }
}
