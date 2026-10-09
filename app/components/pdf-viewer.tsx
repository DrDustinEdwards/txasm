import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

// A reusable, client-only PDF viewer built on self-hosted PDF.js. It renders the
// current page to a canvas and offers page-through, a page indicator, zoom, and
// keyboard navigation. It takes any PDF URL, so generated books and programs can
// reuse it later, not just archive documents.
//
// Client-only on purpose: this app server-renders in Cloudflare Workers (workerd),
// where PDF.js has no DOM. The component renders a static fallback until it has
// mounted in the browser, and PDF.js itself is loaded with a dynamic import from
// inside an effect, so it never enters the worker bundle.

// PDF.js is self-hosted under /public/pdfjs and loaded from those URLs at runtime
// with @vite-ignore, so the bundler never pulls it into either the client or the
// worker (SSR) graph. The dynamic import runs only in the browser, from an effect.
const PDFJS_URL = "/pdfjs/pdf.min.mjs";
const PDFJS_WORKER_URL = "/pdfjs/pdf.worker.min.mjs";
// Support assets PDF.js fetches on demand, also self-hosted. wasmUrl is the one
// that matters for scanned newsletters: without it the JBIG2/JPEG2000 image
// decoders never load and image pages render blank. The rest cover embedded-font
// fallbacks (standard_fonts), CJK text (cmaps), and color profiles (iccs).
const PDFJS_WASM_URL = "/pdfjs/wasm/";
const PDFJS_ICC_URL = "/pdfjs/iccs/";
const PDFJS_FONT_URL = "/pdfjs/standard_fonts/";
const PDFJS_CMAP_URL = "/pdfjs/cmaps/";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1.2;

const controlButton =
  "inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 disabled:hover:bg-transparent";

export function PdfViewer({
  url,
  title,
}: {
  url: string;
  title?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  // The loading task owns destroy(); keep it to tear the document down on change.
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  // Track the in-flight render so a page or zoom change cancels the previous one.
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load the document once per URL (browser only).
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    setStatus("loading");
    setNumPages(0);
    setPage(1);

    void (async () => {
      try {
        const pdfjs = (await import(
          /* @vite-ignore */ PDFJS_URL
        )) as typeof import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        const loadingTask = pdfjs.getDocument({
          url,
          wasmUrl: PDFJS_WASM_URL,
          iccUrl: PDFJS_ICC_URL,
          standardFontDataUrl: PDFJS_FONT_URL,
          cMapUrl: PDFJS_CMAP_URL,
          cMapPacked: true,
        });
        loadingTaskRef.current = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      docRef.current = null;
      const loadingTask = loadingTaskRef.current;
      loadingTaskRef.current = null;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [mounted, url]);

  // Render the current page whenever it or the zoom changes.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (status !== "ready" || !doc || !canvas) return;
    let cancelled = false;

    void (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        renderTaskRef.current?.cancel();
        const task = pdfPage.render({ canvas, canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch {
        // A cancelled render rejects; ignore it. A real failure shows via status.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, page, scale, numPages]);

  const goPrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const goNext = useCallback(
    () => setPage((p) => Math.min(numPages || 1, p + 1)),
    [numPages],
  );
  const zoomOut = useCallback(
    () => setScale((s) => Math.max(MIN_SCALE, Math.round((s - SCALE_STEP) * 100) / 100)),
    [],
  );
  const zoomIn = useCallback(
    () => setScale((s) => Math.min(MAX_SCALE, Math.round((s + SCALE_STEP) * 100) / 100)),
    [],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goNext();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      }
    },
    [goNext, goPrev, zoomIn, zoomOut],
  );

  const label = title ? `PDF viewer, ${title}` : "PDF viewer";

  // Fallback rendered on the server and before hydration, and whenever loading
  // fails. It always offers the raw PDF so the content is reachable without the
  // interactive viewer (and for assistive technology).
  const fallback = (
    <p className="text-sm text-text-muted">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Open the PDF in a new tab
      </a>
    </p>
  );

  if (!mounted) {
    return (
      <div className="rounded-lg border border-border bg-panel p-6">
        {fallback}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="space-y-3 rounded-lg border border-border bg-panel p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={status !== "ready" || page <= 1}
            className={controlButton}
            aria-label="Previous page"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={status !== "ready" || page >= numPages}
            className={controlButton}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
        <p className="text-sm text-text-muted" aria-live="polite">
          {status === "ready" ? `Page ${page} of ${numPages}` : "Loading"}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            disabled={status !== "ready" || scale <= MIN_SCALE}
            className={controlButton}
            aria-label="Zoom out"
          >
            Zoom out
          </button>
          <span className="w-12 text-center text-sm text-text-muted">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={status !== "ready" || scale >= MAX_SCALE}
            className={controlButton}
            aria-label="Zoom in"
          >
            Zoom in
          </button>
        </div>
      </div>

      <div
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`${label}. Use the arrow keys to change page and the plus and minus keys to zoom.`}
        className="max-h-[80vh] overflow-auto rounded border border-border bg-surface-raised p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {status === "error" ? (
          <div className="p-6">
            <p className="text-sm text-text">The viewer could not load this PDF.</p>
            <div className="mt-2">{fallback}</div>
          </div>
        ) : (
          <canvas ref={canvasRef} className="mx-auto block max-w-full" />
        )}
      </div>

      {fallback}
    </div>
  );
}
