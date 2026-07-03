import { Link } from "react-router";
import { PdfViewer } from "./pdf-viewer";
import { documentSubtitle, type ArchiveDoc } from "~/lib/document-nav";

// The shared per-document page body: title and subtitle, a Download button, the
// inline viewer, and Previous/Next within the category. The viewer and the raw
// PDF both point at the serve routes for this document's slug.
export function DocumentDetail({
  doc,
  basePath,
  backTitle,
  prevSlug,
  nextSlug,
}: {
  doc: ArchiveDoc;
  basePath: string;
  backTitle: string;
  prevSlug: string | null;
  nextSlug: string | null;
}) {
  const subtitle = documentSubtitle(doc);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-sm">
          <Link
            to={basePath}
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {backTitle}
          </Link>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          {doc.title}
        </h1>
        {subtitle ? <p className="text-text-muted">{subtitle}</p> : null}
        <p>
          <a
            href={`/documents/${doc.slug}/download`}
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Download PDF
          </a>
        </p>
      </header>

      <PdfViewer url={`/documents/${doc.slug}/inline`} title={doc.title} />

      <nav
        aria-label={`More in ${backTitle}`}
        className="flex justify-between gap-3 border-t border-border pt-4"
      >
        {prevSlug ? (
          <Link
            to={`${basePath}/${prevSlug}`}
            rel="prev"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Previous
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        {nextSlug ? (
          <Link
            to={`${basePath}/${nextSlug}`}
            rel="next"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Next
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
      </nav>
    </div>
  );
}
