import type { Route } from "./+types/newsletters";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { getDataAccess } from "~/lib/data-access";
import { Empty } from "capsomer/react/empty";
import { DocumentList } from "capsomer/react/document-archive";
import { renderLink } from "~/components/site-chrome";
import { documentSubtitle } from "~/lib/document-nav";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import documentList from "~/styles/document-list.css?url";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
// Capsomer stylesheets only this page uses, so no other page downloads them (devkit-route-weight counts them).
export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: documentList }];

export const headers = () => publicPageHeaders();

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/newsletters",
    pageType: "CollectionPage",
    name: "Newsletters",
    description: "Newsletters from the Texas Branch of the American Society for Microbiology.",
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
    <div className="cap-stack" data-gap="7">
      <header className="cap-stack" data-gap="4">
        <h1 className="page-title">Newsletters</h1>
        <p className="lead">
          The branch newsletter shares meeting recaps, award announcements, and news from member
          institutions across Texas. Read past issues below.
        </p>
      </header>

      {documents.length === 0 ? (
        <section aria-label="Newsletter archive">
          <Empty kind="nothing-yet" title="Back issues are being added and will be listed here." />
        </section>
      ) : (
        <section aria-label="Newsletter archive">
          <DocumentList
            docs={documents.map((d) => ({
              key: d.slug,
              title: d.title,
              href: `/newsletters/${d.slug}`,
              detail: documentSubtitle(d) || undefined,
            }))}
            label="Newsletter archive"
            renderLink={renderLink}
          />
        </section>
      )}
    </div>
  );
}
