import { Title } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import { Empty } from "capsomer/react/empty";
import type { Route } from "./+types/archive.$category";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { getDataAccess } from "~/lib/data-access";
import { DocumentList } from "capsomer/react/document-archive";
import { routerRenderLink } from "capsomer/react/link";
import { ARCHIVE_SEGMENTS, CATEGORY_PATHS, documentSubtitle } from "~/lib/document-nav";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import documentList from "~/styles/document-list.css?url";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: documentList }];

export const headers = () => publicPageHeaders();

export function meta({ matches, location, loaderData }: Route.MetaArgs) {
  const title = loaderData?.title ?? "Archive";
  return pageHead(matches, {
    path: location.pathname,
    pageType: "CollectionPage",
    name: title,
    description: `${title} from past Texas Branch ASM meetings, each a PDF to read in the browser or download.`,
  });
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const category = ARCHIVE_SEGMENTS[params.category];
  if (!category) {
    throw new Response("Archive not found.", { status: 404 });
  }
  const config = CATEGORY_PATHS[category];
  const da = getDataAccess(context.get(cloudflareContext).env);
  const rows = await da.documents.listByCategory(category);
  const documents = rows.map((d) => ({
    slug: d.slug,
    title: d.title,
    season: d.season,
    year: d.year,
    editor: d.editor,
  }));
  return {
    title: config?.title ?? "Archive",
    basePath: config?.basePath ?? `/archive/${params.category}`,
    documents,
  };
}

export default function ArchiveCategory({ loaderData }: Route.ComponentProps) {
  const { title, basePath, documents } = loaderData;

  return (
    <Stack gap={7}>
      <Stack as="header" gap={4}>
        <Title as="h1" size={2}>
          {title}
        </Title>
        <p className="cap-muted">
          {documents.length} {documents.length === 1 ? "document" : "documents"}
        </p>
      </Stack>

      <section aria-label={title}>
        {documents.length === 0 ? (
          <Empty kind="nothing-yet" title="No documents yet." />
        ) : (
          <DocumentList
            docs={documents.map((d) => ({
              key: d.slug,
              title: d.title,
              href: `${basePath}/${d.slug}`,
              detail: documentSubtitle(d) || undefined,
            }))}
            label={title}
            renderLink={routerRenderLink}
          />
        )}
      </section>
    </Stack>
  );
}
