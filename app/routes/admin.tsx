import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin";
import { pageTitle } from "~/lib/site-meta";
import { titleCase } from "@drdustinedwards/site-helpers/text";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireAdmin } from "~/lib/auth.server";
import { getDataAccess } from "~/lib/data-access";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Admin"));
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const editions = await getDataAccess(env).editions.list(actor);
  return { editions };
}

export default function AdminIndex({ loaderData }: Route.ComponentProps) {
  const { editions } = loaderData;

  return (
    <div className="cap-stack" data-gap="6">
      <div className="cap-spread">
        <h1 className="cap-title" data-size="2">
          Meetings
        </h1>
        <Link to="/admin/editions/new" className="cap-btn" data-variant="primary">
          Create meeting
        </Link>
      </div>

      {editions.length === 0 ? (
        <p>No meetings yet. Create the first one to get started.</p>
      ) : (
        // Season and year drop as the region narrows (Capsomer's data-drop), so on a phone the name,
        // status and Categories fit without scrolling; both are on each meeting's own page.
        <div className="cap-table-wrap" role="region" aria-label="Meetings" tabIndex={0}>
          <table className="cap-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" data-drop="1">
                  Season
                </th>
                <th scope="col" data-drop="2">
                  Year
                </th>
                <th scope="col">Status</th>
                <th scope="col" className="cap-text" data-align="end">
                  <span className="cap-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {editions.map((edition) => (
                <tr key={edition.id}>
                  <td>
                    <Link
                      to={`/admin/editions/${edition.id}`}
                      className="cap-text"
                      data-weight="strong"
                    >
                      {edition.name}
                    </Link>
                  </td>
                  <td data-drop="1">{titleCase(edition.season)}</td>
                  <td data-drop="2">{edition.year}</td>
                  <td>{titleCase(edition.status)}</td>
                  <td className="cap-text" data-align="end">
                    <Link
                      to={`/admin/editions/${edition.id}/categories`}
                      className="cap-text"
                      data-weight="strong"
                    >
                      Categories
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
