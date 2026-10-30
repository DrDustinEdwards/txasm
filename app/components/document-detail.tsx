import { Link } from "capsomer/react/link";
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
    <div className="stack-6">
      <header className="stack-3">
        <p className="small">
          <Link to={basePath}>{backTitle}</Link>
        </p>
        <h1 className="page-title">{doc.title}</h1>
        {subtitle ? <p className="cap-muted">{subtitle}</p> : null}
        <p>
          <a href={`/documents/${doc.slug}/download`} className="cap-btn" data-variant="primary">
            Download PDF
          </a>
        </p>
      </header>

      <PdfViewer url={`/documents/${doc.slug}/inline`} title={doc.title} />

      <nav aria-label={`More in ${backTitle}`} className="spread doc-pager">
        {prevSlug ? (
          <Link to={`${basePath}/${prevSlug}`} rel="prev">
            Previous
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        {nextSlug ? (
          <Link to={`${basePath}/${nextSlug}`} rel="next">
            Next
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
      </nav>
    </div>
  );
}
