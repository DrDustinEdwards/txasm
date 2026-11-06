import type { PDFDocumentProxy } from "pdfjs-dist";

// The PDF viewer's behavior (app/components/pdf-viewer.tsx renders its markup in the loading state): an island
// (devkit's startIslands, app/site.ts), so a document page sends no React. It renders the current page to the
// canvas and wires page-through, the page indicator, zoom and the keyboard.
//
// PDF.js is self-hosted under /public/pdfjs and loaded from those URLs at runtime with @vite-ignore, so no bundle
// pulls it in. Its support assets: wasmUrl is the one that matters for scanned newsletters (without it the
// JBIG2/JPEG2000 decoders never load and image pages render blank); the rest cover embedded-font fallbacks
// (standard_fonts), CJK text (cmaps) and color profiles (iccs).
const PDFJS_URL = "/pdfjs/pdf.min.mjs";
const PDFJS_WORKER_URL = "/pdfjs/pdf.worker.min.mjs";
const PDFJS_WASM_URL = "/pdfjs/wasm/";
const PDFJS_ICC_URL = "/pdfjs/iccs/";
const PDFJS_FONT_URL = "/pdfjs/standard_fonts/";
const PDFJS_CMAP_URL = "/pdfjs/cmaps/";

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
export const DEFAULT_SCALE = 1.2;

const started = new WeakSet<HTMLElement>();

export default function start(root: HTMLElement, props: { url: string }): void {
  if (started.has(root)) return;
  started.add(root);
  const { url } = props;
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  const prev = q<HTMLButtonElement>("[data-pdf='prev']");
  const next = q<HTMLButtonElement>("[data-pdf='next']");
  const zoomOut = q<HTMLButtonElement>("[data-pdf='zoom-out']");
  const zoomIn = q<HTMLButtonElement>("[data-pdf='zoom-in']");
  const status = q<HTMLElement>("[data-pdf='status']");
  const zoom = q<HTMLElement>("[data-pdf='zoom']");
  const view = q<HTMLElement>(".pdf-viewer-page");
  const canvas = q<HTMLCanvasElement>("canvas");
  if (!prev || !next || !zoomOut || !zoomIn || !status || !zoom || !view || !canvas) return;

  let doc: PDFDocumentProxy | null = null;
  let page = 1;
  let scale = DEFAULT_SCALE;
  // The in-flight render, so a page or zoom change cancels the previous one.
  let renderTask: { cancel: () => void } | null = null;

  function sync() {
    const ready = doc !== null;
    const pages = doc?.numPages ?? 0;
    prev!.disabled = !ready || page <= 1;
    next!.disabled = !ready || page >= pages;
    zoomOut!.disabled = !ready || scale <= MIN_SCALE;
    zoomIn!.disabled = !ready || scale >= MAX_SCALE;
    status!.textContent = ready ? `Page ${page} of ${pages}` : "Loading";
    zoom!.textContent = `${Math.round(scale * 100)}%`;
  }

  async function render() {
    if (!doc) return;
    try {
      const pdfPage = await doc.getPage(page);
      const viewport = pdfPage.getViewport({ scale });
      const context = canvas!.getContext("2d");
      if (!context) return;
      canvas!.width = Math.floor(viewport.width);
      canvas!.height = Math.floor(viewport.height);
      // Drops the page-sized space app.css holds for it until now.
      canvas!.dataset.sized = "";
      renderTask?.cancel();
      const task = pdfPage.render({ canvas: canvas!, canvasContext: context, viewport });
      renderTask = task;
      await task.promise;
    } catch {
      // A canceled render rejects; ignore it.
    }
  }

  function go(to: { page?: number; scale?: number }) {
    if (!doc) return;
    const nextPage = Math.min(Math.max(1, to.page ?? page), doc.numPages || 1);
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((to.scale ?? scale) * 100) / 100));
    if (nextPage === page && nextScale === scale) return;
    page = nextPage;
    scale = nextScale;
    sync();
    void render();
  }

  // In place of the page when loading fails, so the raw PDF is still reachable (the link under the viewer stays too).
  function fail() {
    const error = document.createElement("div");
    error.className = "stack-2 pdf-viewer-error";
    const message = document.createElement("p");
    message.className = "small";
    message.textContent = "The viewer could not load this PDF.";
    error.appendChild(message);
    const fallback = root.querySelector(":scope > p.small");
    if (fallback) error.appendChild(fallback.cloneNode(true));
    canvas!.replaceWith(error);
  }

  prev.addEventListener("click", () => go({ page: page - 1 }));
  next.addEventListener("click", () => go({ page: page + 1 }));
  zoomOut.addEventListener("click", () => go({ scale: scale - SCALE_STEP }));
  zoomIn.addEventListener("click", () => go({ scale: scale + SCALE_STEP }));
  view.addEventListener("keydown", (event) => {
    const step: Record<string, () => void> = {
      ArrowLeft: () => go({ page: page - 1 }),
      PageUp: () => go({ page: page - 1 }),
      ArrowRight: () => go({ page: page + 1 }),
      PageDown: () => go({ page: page + 1 }),
      "+": () => go({ scale: scale + SCALE_STEP }),
      "=": () => go({ scale: scale + SCALE_STEP }),
      "-": () => go({ scale: scale - SCALE_STEP }),
    };
    const run = step[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  });

  void (async () => {
    try {
      const pdfjs = (await import(/* @vite-ignore */ PDFJS_URL)) as typeof import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      doc = await pdfjs.getDocument({
        url,
        wasmUrl: PDFJS_WASM_URL,
        iccUrl: PDFJS_ICC_URL,
        standardFontDataUrl: PDFJS_FONT_URL,
        cMapUrl: PDFJS_CMAP_URL,
        cMapPacked: true,
      }).promise;
      sync();
      await render();
    } catch {
      fail();
    }
  })();
}
