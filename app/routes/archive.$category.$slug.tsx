import type { Route } from "./+types/archive.$category.$slug";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { DocumentDetail } from "~/components/document-detail";
import {
  ARCHIVE_SEGMENTS,
  CATEGORY_PATHS,
  adjacentSlugs,
} from "~/lib/document-nav";
import { pageHead } from "~/lib/site-meta";

export function meta({ matches, location }: Route.MetaArgs) {
  const leaf = matches[matches.length - 1] as
    | { data?: { doc?: { title?: string } } }
    | undefined;
  const title = leaf?.data?.doc?.title ?? "Document";
  return pageHead(matches, {
    path: location.pathname,
    name: title,
    description: `${title}, from the Texas Branch ASM archive.`,
  });
}

// TODO (cutover redirects): match the live per-document paths where reasonable
// and add redirects for any archive slugs that differ at DNS cutover.
export async function loader({ context, params }: Route.LoaderArgs) {
  const category = ARCHIVE_SEGMENTS[params.category];
  if (!category) {
    throw new Response("Archive not found.", { status: 404 });
  }
  const da = getDataAccess(context.get(cloudflareContext).env);
  const doc = await da.documents.getBySlug(params.slug);
  if (!doc || doc.category !== category) {
    throw new Response("Document not found.", { status: 404 });
  }
  const list = await da.documents.listByCategory(category);
  const { prevSlug, nextSlug } = adjacentSlugs(list, doc.slug);
  const config = CATEGORY_PATHS[category];
  return {
    doc: {
      slug: doc.slug,
      title: doc.title,
      season: doc.season,
      year: doc.year,
      editor: doc.editor,
    },
    basePath: config?.basePath ?? `/archive/${params.category}`,
    backTitle: config?.title ?? "Archive",
    prevSlug,
    nextSlug,
  };
}

export default function ArchiveDocumentPage({
  loaderData,
}: Route.ComponentProps) {
  const { doc, basePath, backTitle, prevSlug, nextSlug } = loaderData;
  return (
    <DocumentDetail
      doc={doc}
      basePath={basePath}
      backTitle={backTitle}
      prevSlug={prevSlug}
      nextSlug={nextSlug}
    />
  );
}
