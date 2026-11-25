import "capsomer/breadcrumb.css";
import { Breadcrumb } from "capsomer/react/breadcrumb";
import { DocumentViewer, type PagerDoc } from "capsomer/react/document-archive";
import { routerRenderLink } from "capsomer/react/link";
import { PdfViewer } from "capsomer/react/pdf-viewer";
import type { ArchiveDoc } from "~/lib/document-nav";

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
      before={
        <Breadcrumb
          renderLink={routerRenderLink}
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
      renderLink={routerRenderLink}
    >
      <div data-island="pdf-viewer">
        <PdfViewer src={`/documents/${doc.slug}/inline`} title={doc.title} />
      </div>
    </DocumentViewer>
  );
}
