import type { Route } from "./+types/admin.editions.$editionId.book.preview";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import { getDataAccess } from "~/lib/data-access";
import { renderBook } from "~/lib/book";

// Print-ready abstract book, served as a full HTML document so a chair can open
// it, let Paged.js lay it out, and print to PDF from the browser as the interim
// path. getBookData assembles the data, renderBook is a pure function of it.
//
// Part B (gated on the Workers plan) will add an admin action that renders this
// same HTML to a PDF via the BROWSER binding, stores it in R2, and writes the
// abstract_book row (r2Key, fileName, status ready). Nothing here writes a row.
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const data = await getDataAccess(env).books.getBookData(actor, params.editionId);
  const html = renderBook(data);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
