import type { Route } from "./+types/archive.$category";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { DocumentList } from "~/components/document-list";
import { ARCHIVE_SEGMENTS, CATEGORY_PATHS } from "~/lib/document-nav";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  const leaf = matches[matches.length - 1] as
    | { data?: { title?: string } }
    | undefined;
  return [{ title: pageTitle(matches, leaf?.data?.title ?? "Archive") }];
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
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          {title}
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch's archive of {title.toLowerCase()} from past meetings. Open
          one to read it in the viewer or download the PDF.
        </p>
      </header>

      {documents.length === 0 ? (
        <section
          aria-label={title}
          className="rounded-lg border border-border bg-panel p-6"
        >
          <p className="text-text-muted">
            Documents are being added and will be listed here.
          </p>
        </section>
      ) : (
        <section aria-label={title}>
          <DocumentList documents={documents} basePath={basePath} />
        </section>
      )}
    </div>
  );
}
