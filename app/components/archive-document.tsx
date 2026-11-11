import { Breadcrumb } from "capsomer/react/breadcrumb";
import { DocumentViewer, type PagerDoc } from "capsomer/react/document-archive";
import { renderLink } from "~/components/site-chrome";
import { PdfViewer } from "capsomer/react/pdf-viewer";
import { documentSubtitle, type ArchiveDoc } from "~/lib/document-nav";

// One archive document's page, on Capsomer's DocumentViewer: the breadcrumb
// back to its category, the download, Capsomer's PDF viewer, and Previous and
// Next in the category. The viewer and the download both point at the serve
// routes for the document's slug.
export function ArchiveDocument({
  doc,
  basePath,
  backTitle,
  prev,
  next,
}: {
  doc: ArchiveDoc;
  basePath: string;
  backTitle: string;
  prev: PagerDoc | null;
  next: PagerDoc | null;
}) {
  return (
    <DocumentViewer
      title={doc.title}
      subtitle={documentSubtitle(doc) || undefined}
      before={
        <Breadcrumb
          renderLink={renderLink}
          items={[
            { label: "Home", href: "/" },
            { label: backTitle, href: basePath },
            { label: doc.title },
          ]}
        />
      }
      download={{ href: `/documents/${doc.slug}/download` }}
      prev={prev}
      next={next}
      collection={backTitle}
      renderLink={renderLink}
    >
      <div data-island="pdf-viewer">
        <PdfViewer src={`/documents/${doc.slug}/inline`} title={doc.title} />
      </div>
    </DocumentViewer>
  );
}
