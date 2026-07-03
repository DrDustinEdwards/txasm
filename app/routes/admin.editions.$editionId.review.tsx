import { Form, Link, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.review";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import {
  ConflictOfInterestError,
  NotFoundError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Assign reviewers | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const abstracts = await da.abstracts.listForEdition(actor, params.editionId);
  const grants = await da.roles.listForEdition(actor, params.editionId);
  const assignments = await da.reviews.listAssignmentsForEdition(
    actor,
    params.editionId,
  );
  const reviewers = grants
    .filter((g) => g.role === "reviewer")
    .map((g) => ({ userId: g.userId, name: g.name, email: g.email }));

  return { edition, abstracts, reviewers, assignments };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const abstractId = String(form.get("abstractId") ?? "");

  try {
    if (intent === "unassign") {
      const assignmentId = String(form.get("assignmentId") ?? "");
      if (assignmentId) await da.reviews.unassign(actor, { assignmentId });
      return { ok: true };
    }

    if (intent === "assign") {
      const reviewerId = String(form.get("reviewerId") ?? "");
      if (!reviewerId) {
        return { error: "Choose a reviewer.", abstractId };
      }
      // Skip a duplicate before it reaches the unique constraint.
      const current = await da.reviews.listAssignmentsForEdition(
        actor,
        params.editionId,
      );
      const already = current.some(
        (a) => a.abstractId === abstractId && a.reviewerId === reviewerId,
      );
      if (already) {
        return {
          error: "That reviewer is already assigned to this abstract.",
          abstractId,
        };
      }
      await da.reviews.assignReviewer(actor, { abstractId, reviewerId });
      return { ok: true };
    }
  } catch (error) {
    if (error instanceof ConflictOfInterestError) {
      return {
        error: `Cannot assign: ${error.message}.`,
        abstractId,
      };
    }
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { error: error.message, abstractId };
    }
    throw error;
  }

  return { error: "Unknown action." };
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const inputClass =
  "rounded border border-gray-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

export default function AssignReviewers({ loaderData }: Route.ComponentProps) {
  const { edition, abstracts, reviewers, assignments } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const rowError =
    actionData && "error" in actionData ? actionData : null;

  const byAbstract = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = byAbstract.get(a.abstractId) ?? [];
    list.push(a);
    byAbstract.set(a.abstractId, list);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Assign reviewers</h1>
        <p className="text-gray-700 dark:text-gray-300">
          {edition.name}.{" "}
          <Link
            to={`/admin/editions/${edition.id}/roles`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Chairs and reviewers
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link
            to={`/admin/editions/${edition.id}`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Edit meeting
          </Link>
        </p>
      </div>

      {reviewers.length === 0 ? (
        <p
          role="status"
          className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
        >
          No reviewers on this meeting yet. Add reviewers first under Chairs and
          reviewers.
        </p>
      ) : null}

      {abstracts.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          No submitted abstracts yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {abstracts.map((abstract) => {
            const assigned = byAbstract.get(abstract.id) ?? [];
            const assignedIds = new Set(assigned.map((a) => a.reviewerId));
            const available = reviewers.filter((r) => !assignedIds.has(r.userId));
            const showError =
              rowError && "abstractId" in rowError
                ? rowError.abstractId === abstract.id
                : false;

            return (
              <li
                key={abstract.id}
                className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="font-medium">
                      {abstract.title ? (
                        <span
                          dangerouslySetInnerHTML={{ __html: abstract.title }}
                        />
                      ) : (
                        <span className="text-gray-500">Untitled</span>
                      )}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {abstract.authorNames.length > 0
                        ? abstract.authorNames.join(", ")
                        : "No authors listed"}
                    </p>
                  </div>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {titleCase(abstract.status)}
                  </span>
                </div>

                {showError && rowError && "error" in rowError ? (
                  <p
                    role="alert"
                    className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                  >
                    {rowError.error}
                  </p>
                ) : null}

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Reviewers</h3>
                  {assigned.length === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      None assigned yet.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {assigned.map((a) => (
                        <li
                          key={a.assignmentId}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            {a.reviewerName || a.reviewerEmail}{" "}
                            <span
                              className={
                                a.reviewSubmitted
                                  ? "text-green-700 dark:text-green-400"
                                  : "text-gray-600 dark:text-gray-400"
                              }
                            >
                              ({a.reviewSubmitted ? "review submitted" : "assigned"})
                            </span>
                          </span>
                          <Form method="post">
                            <input type="hidden" name="intent" value="unassign" />
                            <input
                              type="hidden"
                              name="abstractId"
                              value={abstract.id}
                            />
                            <input
                              type="hidden"
                              name="assignmentId"
                              value={a.assignmentId}
                            />
                            <button
                              type="submit"
                              className="font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                            >
                              Unassign
                              <span className="sr-only">
                                {" "}
                                {a.reviewerName || a.reviewerEmail}
                              </span>
                            </button>
                          </Form>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {available.length > 0 ? (
                  <Form
                    method="post"
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="intent" value="assign" />
                    <input type="hidden" name="abstractId" value={abstract.id} />
                    <div className="space-y-1">
                      <label
                        htmlFor={`reviewer-${abstract.id}`}
                        className="block text-sm font-medium"
                      >
                        Add a reviewer
                      </label>
                      <select
                        id={`reviewer-${abstract.id}`}
                        name="reviewerId"
                        defaultValue=""
                        className={inputClass}
                      >
                        <option value="" disabled>
                          Choose a reviewer
                        </option>
                        {available.map((r) => (
                          <option key={r.userId} value={r.userId}>
                            {r.name ? `${r.name} (${r.email})` : r.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
                    >
                      Assign
                    </button>
                  </Form>
                ) : reviewers.length > 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Every reviewer on this meeting is already assigned.
                  </p>
                ) : null}

                <p className="text-sm">
                  <Link
                    to={`/admin/editions/${edition.id}/review/${abstract.id}`}
                    className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    Read reviews ({abstract.reviewCount})
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
