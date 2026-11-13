import { Title, Text } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import "capsomer/table.css";
import { ButtonLink, Link } from "capsomer/react/link";
import { Table } from "capsomer/react/table";
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
    <Stack gap={6}>
      <div className="cap-spread">
        <Title as="h1" size={2}>
          Meetings
        </Title>
        <ButtonLink to="/admin/editions/new" variant="primary">
          Create meeting
        </ButtonLink>
      </div>

      {editions.length === 0 ? (
        <p>No meetings yet. Create the first one to get started.</p>
      ) : (
        // Season and year drop as the region narrows (Capsomer's data-drop), so on a phone the name,
        // status and Categories fit without scrolling; both are on each meeting's own page.
        <Table caption="Meetings" captionHidden>
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
              <Text as="th" scope="col" align="end">
                <span className="cap-sr-only">Actions</span>
              </Text>
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
                <Text as="td" align="end">
                  <Link
                    to={`/admin/editions/${edition.id}/categories`}
                    className="cap-text"
                    data-weight="strong"
                  >
                    Categories
                  </Link>
                </Text>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Stack>
  );
}
