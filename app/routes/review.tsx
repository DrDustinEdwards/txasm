import { Link } from "react-router";
import type { Route } from "./+types/review";
import { pageTitle } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireUser } from "~/lib/auth.server";
import { getActor, getDataAccess } from "~/lib/data-access";
import { formatDateTime } from "~/lib/format";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Review") }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user.id);
  const assignments = await getDataAccess(env).reviews.listAssignedAll(actor);
  return { assignments };
}

export default function ReviewDashboard({ loaderData }: Route.ComponentProps) {
  const { assignments } = loaderData;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Review</h1>

      {assignments.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          You have no abstracts to review right now. A chair assigns abstracts to
          you, and they show up here.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th scope="col" className="py-2 pr-4 font-medium">
                Title
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Meeting
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Due
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
            {assignments.map((assignment) => (
              <tr
                key={assignment.assignmentId}
                className="border-b border-gray-100 dark:border-gray-900"
              >
                <td className="py-2 pr-4">
                  {assignment.title ? (
                    <span
                      dangerouslySetInnerHTML={{ __html: assignment.title }}
                    />
                  ) : (
                    <span className="text-gray-500">Untitled</span>
                  )}
                </td>
                <td className="py-2 pr-4">{assignment.editionName}</td>
                <td className="py-2 pr-4">
                  {assignment.dueAt ? formatDateTime(assignment.dueAt) : "No due date"}
                </td>
                <td className="py-2 pr-4">
                  {assignment.reviewSubmitted ? (
                    <span className="text-green-700 dark:text-green-400">
                      Review submitted
                    </span>
                  ) : (
                    "Awaiting review"
                  )}
                </td>
                <td className="py-2 text-right">
                  <Link
                    to={`/review/${assignment.assignmentId}`}
                    className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {assignment.reviewSubmitted ? "View or edit" : "Review"}
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
