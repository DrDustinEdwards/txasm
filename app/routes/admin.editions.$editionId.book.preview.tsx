import type { Route } from "./+types/admin.editions.$editionId.book.preview";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import { NotFoundError, getDataAccess } from "~/lib/data-access";
import { renderArrangedBook } from "~/lib/book";

// Print-ready preview of the chair's ARRANGED abstract book, served as a full
// HTML document so a chair can open it, let Paged.js lay it out, and print to PDF
// from the browser. books.renderData assembles the arranged data (sections,
// codes, all-authors index); renderArrangedBook is a pure function of it.
//
// Part B (gated on the Workers plan) will render this same HTML to a stored PDF
// via the BROWSER binding. Nothing here writes a row.
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  try {
    const data = await getDataAccess(env).books.renderData(actor, params.editionId);
    const html = renderArrangedBook(data);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return new Response(
        "<!doctype html><meta charset=utf-8><title>No book yet</title><body style=\"font-family:system-ui;padding:2rem\"><p>No book has been generated for this meeting yet. Generate it from the book builder, then reopen this preview.</p></body>",
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }
    throw error;
  }
}
