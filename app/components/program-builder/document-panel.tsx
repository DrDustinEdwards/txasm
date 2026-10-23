import { Form } from "react-router";
import type { DataAccess } from "~/lib/data-access";
import { formatDateTime } from "~/lib/format";

export function ProgramDocumentPanel({
  document,
  editionId,
  busy,
}: {
  document: Awaited<ReturnType<DataAccess["documents"]["getGeneratedForEdition"]>>;
  editionId: string;
  busy: boolean;
}) {
  return (
    <section className="card stack-3">
      <h2 className="subsection-title">Program document</h2>
      <p className="small cap-muted">
        Generate the printable program PDF from this schedule. It runs Browser Rendering and can
        take up to a minute.
      </p>
      {!document ? (
        <p className="small">No program PDF generated yet.</p>
      ) : document.genStatus === "ready" ? (
        <div className="stack-1 small">
          <p>
            <span className="strong ok-text">Ready</span>
            {document.generatedAt ? ` . Generated ${formatDateTime(document.generatedAt)}` : ""}
          </p>
          <p>
            <a href={`/admin/editions/${editionId}/program-document/download`} className="strong">
              Download the PDF
            </a>
          </p>
          <p>
            {document.status === "published" ? (
              <span className="strong ok-text">Published</span>
            ) : (
              <span className="cluster">
                <span className="cap-muted">Draft.</span>
                <Form method="post">
                  <input type="hidden" name="intent" value="document-publish" />
                  <input type="hidden" name="documentId" value={document.id} />
                  <button type="submit" disabled={busy} className="cap-btn" data-size="sm">
                    Publish
                  </button>
                </Form>
              </span>
            )}
          </p>
        </div>
      ) : document.genStatus === "generating" ? (
        <p className="small">
          A generation is in progress. Refresh this page in a minute to see the result.
        </p>
      ) : document.genStatus === "failed" ? (
        <p className="small crit-text">The last generation failed. Try again below.</p>
      ) : (
        <p className="small">Pending</p>
      )}
      <Form method="post">
        <input type="hidden" name="intent" value="document-generate" />
        <button type="submit" disabled={busy} className="cap-btn" data-variant="primary">
          {document ? "Regenerate program PDF" : "Generate program PDF"}
        </button>
      </Form>
    </section>
  );
}
