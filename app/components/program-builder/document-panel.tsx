import { Form } from "react-router";
import type { DataAccess } from "~/lib/data-access";
import { formatDateTime } from "~/lib/format";
import { smallButton } from "./shared";

export function ProgramDocumentPanel({
  document,
  editionId,
  busy,
}: {
  document: Awaited<
    ReturnType<DataAccess["documents"]["getGeneratedForEdition"]>
  >;
  editionId: string;
  busy: boolean;
}) {
  return (
    <section className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800">
      <h2 className="text-lg font-medium">Program document</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Generate the printable program PDF from this schedule. It runs Browser
        Rendering and can take up to a minute.
      </p>
      {!document ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          No program PDF generated yet.
        </p>
      ) : document.genStatus === "ready" ? (
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium text-green-700 dark:text-green-400">
              Ready
            </span>
            {document.generatedAt
              ? ` . Generated ${formatDateTime(document.generatedAt)}`
              : ""}
          </p>
          <p>
            <a
              href={`/admin/editions/${editionId}/program-document/download`}
              className="font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Download the PDF
            </a>
          </p>
          <p>
            {document.status === "published" ? (
              <span className="font-medium text-green-700 dark:text-green-400">
                Published
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-gray-600 dark:text-gray-400">Draft.</span>
                <Form method="post">
                  <input type="hidden" name="intent" value="document-publish" />
                  <input type="hidden" name="documentId" value={document.id} />
                  <button type="submit" disabled={busy} className={smallButton}>
                    Publish
                  </button>
                </Form>
              </span>
            )}
          </p>
        </div>
      ) : document.genStatus === "generating" ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          A generation is in progress. Refresh this page in a minute to see the
          result.
        </p>
      ) : document.genStatus === "failed" ? (
        <p className="text-sm text-red-700 dark:text-red-400">
          The last generation failed. Try again below.
        </p>
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-300">Pending</p>
      )}
      <Form method="post">
        <input type="hidden" name="intent" value="document-generate" />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
        >
          {document ? "Regenerate program PDF" : "Generate program PDF"}
        </button>
      </Form>
    </section>
  );
}
