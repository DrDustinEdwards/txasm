// Server-only: render the Part A abstract book HTML to a PDF with Browser
// Rendering (the BROWSER binding) via @cloudflare/puppeteer. It takes the HTML
// string and env, returns the PDF bytes. It imports nothing from the schema or
// the Drizzle client; the data-access layer records status, this only renders.
//
// The HTML from renderBook loads Paged.js from a CDN and sets a completion hook
// that marks the document with data-pagedjs-done when pagination finishes. We
// wait on that so page.pdf captures the paginated output, not the raw DOM. A
// hard timeout wraps the whole render so a stuck job fails cleanly.

import puppeteer from "@cloudflare/puppeteer";

const RENDER_TIMEOUT_MS = 90_000; // overall ceiling for one render
const LOAD_TIMEOUT_MS = 60_000; // setContent, including the Paged.js CDN fetch
const PAGEDJS_TIMEOUT_MS = 60_000; // waiting for Paged.js to finish paginating

// launch expects a BrowserWorker ({ fetch }); the generated binding type is
// BrowserRun, structurally compatible but not identical, so cast at the edge.
type BrowserBinding = Parameters<typeof puppeteer.launch>[0];

export async function renderBookPdf(
  html: string,
  env: Env,
): Promise<Uint8Array> {
  const browser = await puppeteer.launch(env.BROWSER as unknown as BrowserBinding);
  try {
    return await withTimeout(renderWithBrowser(browser, html), RENDER_TIMEOUT_MS);
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

  // networkidle0 fires once the CDN script has loaded, but Paged.js keeps
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
