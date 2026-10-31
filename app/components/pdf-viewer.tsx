import { useEffect, useRef } from "react";
import startPdfViewer, { DEFAULT_SCALE } from "~/islands/pdf-viewer";

// A reusable PDF viewer built on self-hosted PDF.js: the current page on a canvas, page-through, a page indicator,
// zoom and keyboard navigation. It takes any PDF URL, so generated books and programs can reuse it, not just archive
// documents.
//
// This renders its markup in the loading state; the behavior is the pdf-viewer island (app/islands/pdf-viewer.ts),
// which /site.js starts on a page that sends no React (root.tsx). When React itself renders the viewer (a client-side
// navigation from a hydrating page), the effect below starts the same island, once. PDF.js never enters a bundle:
// the island imports it from /pdfjs at runtime, in the browser only.

export function PdfViewer({
  url,
  title,
}: {
  url: string;
  title?: string;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (root.current) startPdfViewer(root.current, { url });
  }, [url]);

  const label = title ? `PDF viewer, ${title}` : "PDF viewer";

  // Rendered always, so the raw PDF is reachable without the interactive viewer (and for assistive technology); the
  // island repeats it in place of the page when loading fails.
  const fallback = (
    <p className="small">
      <a href={url}>
        Open the PDF
      </a>
    </p>
  );

  return (
    <div
      ref={root}
      role="group"
      aria-label={label}
      className="pdf-viewer stack-3"
      data-island="pdf-viewer"
      data-props={JSON.stringify({ url })}
    >
      <div className="cluster pdf-viewer-bar">
        <div className="cap-btn-group" role="group" aria-label="Pages">
          <button type="button" disabled className="cap-btn" data-size="sm" aria-label="Previous page" data-pdf="prev">
            Previous
          </button>
          <button type="button" disabled className="cap-btn" data-size="sm" aria-label="Next page" data-pdf="next">
            Next
          </button>
        </div>
        <p className="small cap-muted" aria-live="polite" data-pdf="status">
          Loading
        </p>
        <div className="cluster pdf-viewer-zoom">
          <button type="button" disabled className="cap-btn" data-size="sm" aria-label="Zoom out" data-pdf="zoom-out">
            Zoom out
          </button>
          <span className="small cap-muted cap-num" data-pdf="zoom">
            {Math.round(DEFAULT_SCALE * 100)}%
          </span>
          <button type="button" disabled className="cap-btn" data-size="sm" aria-label="Zoom in" data-pdf="zoom-in">
            Zoom in
          </button>
        </div>
      </div>

      <div
        tabIndex={0}
        aria-label={`${label}. Use the arrow keys to change page and the plus and minus keys to zoom.`}
        className="pdf-viewer-page"
      >
        <canvas />
      </div>

      {fallback}
    </div>
  );
}
