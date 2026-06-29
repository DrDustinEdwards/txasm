import { Link } from "react-router";
import type { Route } from "./+types/admin";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import { getDataAccess } from "~/lib/data-access";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Admin | Texas Branch ASM" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const editions = await getDataAccess(env).editions.list(actor);
  return { editions };
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AdminIndex({ loaderData }: Route.ComponentProps) {
  const { editions } = loaderData;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Meetings</h1>
        <Link
          to="/admin/editions/new"
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Create meeting
        </Link>
      </div>

      {editions.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          No meetings yet. Create the first one to get started.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th scope="col" className="py-2 pr-4 font-medium">
                Name
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Season
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Year
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Status
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {editions.map((edition) => (
              <tr
                key={edition.id}
                className="border-b border-gray-100 dark:border-gray-900"
              >
                <td className="py-2 pr-4">
                  <Link
                    to={`/admin/editions/${edition.id}`}
                    className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {edition.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">{titleCase(edition.season)}</td>
                <td className="py-2 pr-4">{edition.year}</td>
                <td className="py-2 pr-4">{titleCase(edition.status)}</td>
                <td className="py-2 text-right">
                  <Link
                    to={`/admin/editions/${edition.id}/categories`}
                    className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    Categories
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
