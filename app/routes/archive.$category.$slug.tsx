import type { Route } from "./+types/archive.$category.$slug";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { getDataAccess } from "~/lib/data-access";
import { ArchiveDocument } from "~/components/archive-document";
import { ARCHIVE_SEGMENTS, CATEGORY_PATHS, neighbors } from "~/lib/document-nav";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

export function meta({ matches, location, loaderData }: Route.MetaArgs) {
  const title = loaderData?.doc?.title ?? "Document";
  return pageHead(matches, {
    path: location.pathname,
    name: title,
    description: `${title}, from the Texas Branch ASM archive of past meetings: the PDF to read in the browser or download.`,
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
  const config = CATEGORY_PATHS[category];
  const basePath = config?.basePath ?? `/archive/${params.category}`;
  const { prev, next } = neighbors(list, doc.slug, basePath);
  return {
    doc: {
      slug: doc.slug,
      title: doc.title,
      season: doc.season,
      year: doc.year,
      editor: doc.editor,
    },
    basePath,
    backTitle: config?.title ?? "Archive",
    prev,
    next,
  };
}

export default function ArchiveDocumentPage({ loaderData }: Route.ComponentProps) {
  const { doc, basePath, backTitle, prev, next } = loaderData;
  return (
    <ArchiveDocument doc={doc} basePath={basePath} backTitle={backTitle} prev={prev} next={next} />
  );
}
