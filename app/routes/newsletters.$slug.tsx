import type { Route } from "./+types/newsletters.$slug";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { DocumentDetail } from "~/components/document-detail";
import { adjacentSlugs } from "~/lib/document-nav";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

export function meta({ matches, location, loaderData }: Route.MetaArgs) {
  const title = loaderData?.doc?.title ?? "Newsletter";
  return pageHead(matches, {
    path: location.pathname,
    name: title,
    description: `${title}, a newsletter of the Texas Branch of the American Society for Microbiology.`,
  });
}

// TODO (cutover redirects): confirm each newsletter slug matches the live path
// (for example /newsletters/fall-1991-newsletter) and add redirects for any that
// differ, so existing links and search results survive DNS cutover.
export async function loader({ context, params }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const doc = await da.documents.getBySlug(params.slug);
  if (!doc || doc.category !== "newsletter") {
    throw new Response("Newsletter not found.", { status: 404 });
  }
  const list = await da.documents.listByCategory("newsletter");
  const { prevSlug, nextSlug } = adjacentSlugs(list, doc.slug);
  return {
    doc: {
      slug: doc.slug,
      title: doc.title,
      season: doc.season,
      year: doc.year,
      editor: doc.editor,
    },
    prevSlug,
    nextSlug,
  };
}

export default function NewsletterPage({ loaderData }: Route.ComponentProps) {
  const { doc, prevSlug, nextSlug } = loaderData;
  return (
    <DocumentDetail
      doc={doc}
      basePath="/newsletters"
      backTitle="Newsletters"
      prevSlug={prevSlug}
      nextSlug={nextSlug}
    />
  );
}
