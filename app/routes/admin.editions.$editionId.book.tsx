import { useEffect, useRef } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.book";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import { ValidationError, getDataAccess } from "~/lib/data-access";
import { renderBook } from "~/lib/book";
import { renderBookPdf } from "~/lib/book-pdf.server";
import { formatDateTime } from "~/lib/format";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Abstract book | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const book = await da.documents.getGeneratedForEdition(
    actor,
    params.editionId,
    "abstract_book",
  );
  return { edition: { id: edition.id, name: edition.name }, book };
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// The book is generated only on the explicit button press below, never on load.
// Publish flips the generated document to public.
export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const editionId = params.editionId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "publish") {
    try {
      await da.documents.publish(actor, String(form.get("documentId") ?? ""));
      return { ok: "The abstract book is published." };
    } catch (error) {
      if (error instanceof ValidationError) return { error: error.message };
      throw error;
    }
  }

  // Claim the generating slot first; this rejects a second concurrent run.
  let generatingId: string;
  try {
    const claim = await da.documents.recordGenerating(actor, {
      editionId,
      category: "abstract_book",
    });
    generatingId = claim.id;
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }

  try {
    const data = await da.books.getBookData(actor, editionId);
    const html = renderBook(data);
    const bytes = await renderBookPdf(html, env);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const r2Key = `editions/${editionId}/abstract-book-${stamp}.pdf`;
    const fileName = `TXASM ${titleCase(data.edition.season)} ${data.edition.year} Abstract Book.pdf`;

    await env.BOOKS.put(r2Key, bytes, {
      httpMetadata: { contentType: "application/pdf" },
    });
    await da.documents.recordReady(actor, generatingId, {
      r2Key,
      fileName,
      abstractCount: data.abstractCount,
    });
    return { ok: "The abstract book PDF is ready." };
  } catch (error) {
    await da.documents.recordFailed(actor, generatingId);
    console.error("[book] generation failed", error);
    const detail = error instanceof Error ? error.message : "";
    return {
      error: `The book could not be generated.${detail ? ` ${detail}` : ""}`,
    };
  }
}

export default function AbstractBookAdmin({ loaderData }: Route.ComponentProps) {
  const { edition, book } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const generating = navigation.state === "submitting";

  const statusRef = useRef<HTMLParagraphElement>(null);
  const error = actionData && "error" in actionData ? actionData.error : null;
  const ok = actionData && "ok" in actionData ? actionData.ok : null;

  useEffect(() => {
    if (actionData) statusRef.current?.focus();
  }, [actionData]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Abstract book</h1>
        <p className="text-gray-700 dark:text-gray-300">
          {edition.name}.{" "}
          <Link
            to={`/admin/editions/${edition.id}`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Edit meeting
          </Link>
        </p>
        <p className="text-gray-600 dark:text-gray-400">
          Generate the printed proceedings as a PDF from the accepted abstracts.
          This runs Browser Rendering and can take up to a minute.
        </p>
      </div>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={
          error
            ? "rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            : ok
              ? "rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
              : "sr-only"
        }
      >
        {typeof error === "string" ? error : typeof ok === "string" ? ok : ""}
      </p>

      <section className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-lg font-medium">Current book</h2>
        {!book ? (
          <p className="text-gray-700 dark:text-gray-300">
            No book generated yet.
          </p>
        ) : book.genStatus === "ready" ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium text-green-700 dark:text-green-400">
                Ready
              </span>
              {book.generatedAt
                ? ` . Generated ${formatDateTime(book.generatedAt)}`
                : ""}
              {typeof book.abstractCount === "number"
                ? ` . ${book.abstractCount} abstracts`
                : ""}
            </p>
            <p>
              <a
                href={`/admin/editions/${edition.id}/book/download`}
                className="font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                Download the PDF
              </a>
            </p>
            <p>
              {book.status === "published" ? (
                <span className="font-medium text-green-700 dark:text-green-400">
                  Published
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-gray-600 dark:text-gray-400">Draft.</span>
                  <Form method="post">
                    <input type="hidden" name="intent" value="publish" />
                    <input type="hidden" name="documentId" value={book.id} />
                    <button
                      type="submit"
                      disabled={generating}
                      className="rounded-md border border-border px-2 py-1 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
                    >
                      Publish
                    </button>
                  </Form>
                </span>
              )}
            </p>
          </div>
        ) : book.genStatus === "generating" ? (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            A generation is in progress. Refresh this page in a minute to see the
            result.
          </p>
        ) : book.genStatus === "failed" ? (
          <p className="text-sm text-red-700 dark:text-red-400">
            The last generation failed. Try again below.
          </p>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300">Pending</p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Form method="post">
          <input type="hidden" name="intent" value="generate" />
          <button
            type="submit"
            disabled={generating}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
          >
            {generating
              ? "Generating the PDF..."
              : book
                ? "Regenerate the PDF"
                : "Generate abstract book PDF"}
          </button>
        </Form>
        <a
          href={`/admin/editions/${edition.id}/book/preview`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
        >
          Open the browser preview
        </a>
      </div>
    </div>
  );
}
