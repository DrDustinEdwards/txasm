import { Link } from "capsomer/react/link";
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
    <div className="stack-6">
      <h1 className="page-title">Review</h1>

      {assignments.length === 0 ? (
        <p>
          You have no abstracts to review right now. A chair assigns abstracts to you, and they show
          up here.
        </p>
      ) : (
        <div
          className="cap-table-wrap"
          role="region"
          aria-label="Your review assignments"
          tabIndex={0}
        >
          <table className="cap-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Meeting</th>
                <th scope="col">Due</th>
                <th scope="col">Status</th>
                <th scope="col" className="cell-end">
                  <span className="cap-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.assignmentId}>
                  <td>
                    {assignment.title ? (
                      <span dangerouslySetInnerHTML={{ __html: assignment.title }} />
                    ) : (
                      <span className="cap-muted">Untitled</span>
                    )}
                  </td>
                  <td>{assignment.editionName}</td>
                  <td>{assignment.dueAt ? formatDateTime(assignment.dueAt) : "No due date"}</td>
                  <td>
                    {assignment.reviewSubmitted ? (
                      <span className="ok-text">Review submitted</span>
                    ) : (
                      "Awaiting review"
                    )}
                  </td>
                  <td className="cell-end">
                    <Link to={`/review/${assignment.assignmentId}`} className="strong">
                      {assignment.reviewSubmitted ? "View or edit" : "Review"}
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
