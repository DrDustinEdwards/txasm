// Server-only: render the arranged abstract book HTML to a PDF with Browser
// Rendering (the BROWSER binding) via @cloudflare/puppeteer, and the publish
// orchestration that produces and stores it. It reaches env bindings (BROWSER,
// BOOKS) and drives the data-access layer, which is why the publish orchestration
// lives here in a *.server module and not inside the data boundary (books.publish
// has no env and only freezes codes + stores the HTML).
//
// The HTML from renderArrangedBook loads the self-hosted Paged.js and sets a
// completion hook that marks the document with data-pagedjs-done when pagination
// finishes. We wait on that so page.pdf captures the paginated output, not the raw
// DOM. A hard timeout wraps the whole render so a stuck job fails cleanly.

import puppeteer from "@cloudflare/puppeteer";
import { renderArrangedBook } from "./book";
import type { Actor, DataAccess } from "./data-access";
import { PDF_MIME_TYPE } from "./vocab";

const RENDER_TIMEOUT_MS = 90_000; // overall ceiling for one render
const LOAD_TIMEOUT_MS = 60_000; // setContent, including the Paged.js fetch
const PAGEDJS_TIMEOUT_MS = 60_000; // waiting for Paged.js to finish paginating

// launch expects a BrowserWorker ({ fetch }); the generated binding type is
// BrowserRun, structurally compatible but not identical, so cast at the edge.
type BrowserBinding = Parameters<typeof puppeteer.launch>[0];

// `origin` is the site's: the book names Paged.js and its fonts by path, and the page the
// browser opens has no address of its own, so a <base> resolves them against the site.
export async function renderBookPdf(
  html: string,
  env: Env,
  origin: string,
): Promise<Uint8Array> {
  const browser = await puppeteer.launch(env.BROWSER as unknown as BrowserBinding);
  try {
    const based = html.replace(/<head>/i, `<head>\n<base href="${origin}/" />`);
    return await withTimeout(renderWithBrowser(browser, based), RENDER_TIMEOUT_MS);
  } finally {
    await browser.close();
  }
}

async function renderWithBrowser(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  html: string,
): Promise<Uint8Array> {
  const page = await browser.newPage();
  await page.setContent(html, {
    waitUntil: "networkidle0",
    timeout: LOAD_TIMEOUT_MS,
  });

  // Wait for the self-hosted book fonts to finish loading before we treat the
  // layout as final, so Paged.js measures with the real serif metrics and never
  // paginates against a fallback face.
  await page.evaluate("document.fonts.ready");

  // networkidle0 fires once the Paged.js script has loaded, but Paged.js keeps
  // working after that, so wait for the completion hook it sets on the root.
  await page.waitForFunction(
    "document.documentElement.getAttribute('data-pagedjs-done') === 'true'",
    { timeout: PAGEDJS_TIMEOUT_MS, polling: 200 },
  );

  // A short settle so the final layout and web fonts paint before capture.
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Paged.js sizes its own page boxes; preferCSSPageSize keeps the PDF pages in
  // step with the A4 @page rule from the Part A stylesheet.
  const pdf = await page.pdf({
    printBackground: true,
    format: "A4",
    preferCSSPageSize: true,
  });
  return pdf;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The book render timed out.")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
  const prior = await da.documents.getGeneratedForEdition(
    actor,
    editionId,
    "abstract_book",
  );
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
    const bytes = await renderBookPdf(html, env, origin);
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
