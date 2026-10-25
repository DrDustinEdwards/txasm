import type { Route } from "./+types/newsletters";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { Empty } from "capsomer/react/empty";
import { DocumentList } from "~/components/document-list";
import { pageHead } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/newsletters",
    name: "Newsletters",
    description:
      "Newsletters from the Texas Branch of the American Society for Microbiology.",
  });
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
    <div className="stack-8">
      <header className="stack-3">
        <h1 className="page-title">Newsletters</h1>
        <p className="lead">
          The branch newsletter shares meeting recaps, award announcements, and
          news from member institutions across Texas. Read past issues below.
        </p>
      </header>

      {documents.length === 0 ? (
        <section aria-label="Newsletter archive">
          <Empty kind="nothing-yet" title="Back issues are being added and will be listed here." />
        </section>
      ) : (
        <section aria-label="Newsletter archive">
          <DocumentList documents={documents} basePath="/newsletters" />
        </section>
      )}
    </div>
  );
}
