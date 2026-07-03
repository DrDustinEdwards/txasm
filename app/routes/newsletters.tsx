import type { Route } from "./+types/newsletters";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { DocumentList } from "~/components/document-list";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Newsletters") },
    {
      name: "description",
      content:
        "Newsletters from the Texas Branch of the American Society for Microbiology.",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const rows = await da.documents.listByCategory("newsletter");
  const documents = rows.map((d) => ({
    slug: d.slug,
    title: d.title,
    season: d.season,
    year: d.year,
    editor: d.editor,
  }));
  return { documents };
}

export default function Newsletters({ loaderData }: Route.ComponentProps) {
  const { documents } = loaderData;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Newsletters
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch newsletter shares meeting recaps, award announcements, and
          news from member institutions across Texas. Read past issues below.
        </p>
      </header>

      {documents.length === 0 ? (
        <section
          aria-label="Newsletter archive"
          className="rounded-lg border border-border bg-panel p-6"
        >
          <p className="text-text-muted">
            Back issues are being added and will be listed here.
          </p>
        </section>
      ) : (
        <section aria-label="Newsletter archive">
          <DocumentList documents={documents} basePath="/newsletters" />
        </section>
      )}
    </div>
  );
}
