import { Empty } from "capsomer/react/empty";
import type { Route } from "./+types/archive.$category";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { DocumentList } from "~/components/document-list";
import { ARCHIVE_SEGMENTS, CATEGORY_PATHS } from "~/lib/document-nav";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

export function meta({ matches, location, loaderData }: Route.MetaArgs) {
  const title = loaderData?.title ?? "Archive";
  return pageHead(matches, {
    path: location.pathname,
    name: title,
    description: `${title} from past Texas Branch ASM meetings.`,
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
    <div className="stack-8">
      <header className="stack-3">
        <h1 className="page-title">{title}</h1>
        <p className="lead">
          The branch's archive of {title.toLowerCase()} from past meetings. Open
          one to read it in the viewer or download the PDF.
        </p>
      </header>

      <section aria-label={title}>
        {documents.length === 0 ? (
          <Empty kind="nothing-yet" title="Documents are being added and will be listed here." />
        ) : (
          <DocumentList documents={documents} basePath={basePath} />
        )}
      </section>
    </div>
  );
}
