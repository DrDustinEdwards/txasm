import { Form, Link, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.review";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import {
  ConflictOfInterestError,
  NotFoundError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Assign reviewers");
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const abstracts = await da.abstracts.listForEdition(actor, params.editionId);
  const grants = await da.roles.listForEdition(actor, params.editionId);
  const assignments = await da.reviews.listAssignmentsForEdition(actor, params.editionId);
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
      const current = await da.reviews.listAssignmentsForEdition(actor, params.editionId);
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

export default function AssignReviewers({ loaderData }: Route.ComponentProps) {
  const { edition, abstracts, reviewers, assignments } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const rowError = actionData && "error" in actionData ? actionData : null;

  const byAbstract = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = byAbstract.get(a.abstractId) ?? [];
    list.push(a);
    byAbstract.set(a.abstractId, list);
  }

  return (
    <div className="stack-6">
      <div className="stack-2">
        <h1 className="page-title">Assign reviewers</h1>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}/roles`} className="strong">
            Chairs and reviewers
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}`} className="strong">
            Edit meeting
          </Link>
        </p>
      </div>

      {reviewers.length === 0 ? (
        <p role="status" className="card card-s card-sunken small">
          No reviewers on this meeting yet. Add reviewers first under Chairs and reviewers.
        </p>
      ) : null}

      {abstracts.length === 0 ? (
        <p>No submitted abstracts yet.</p>
      ) : (
        <ul className="stack-4">
          {abstracts.map((abstract) => {
            const assigned = byAbstract.get(abstract.id) ?? [];
            const assignedIds = new Set(assigned.map((a) => a.reviewerId));
            const available = reviewers.filter((r) => !assignedIds.has(r.userId));
            const showError =
              rowError && "abstractId" in rowError ? rowError.abstractId === abstract.id : false;

            return (
              <li key={abstract.id} className="card stack-3">
                <div className="spread">
                  <div className="stack-1">
                    <h2 className="strong">
                      {abstract.title ? (
                        <span dangerouslySetInnerHTML={{ __html: abstract.title }} />
                      ) : (
                        <span className="cap-muted">Untitled</span>
                      )}
                    </h2>
                    <p className="small cap-muted">
                      {abstract.authorNames.length > 0
                        ? abstract.authorNames.join(", ")
                        : "No authors listed"}
                    </p>
                  </div>
                  <span className="cap-badge" data-variant="secondary">
                    {titleCase(abstract.status)}
                  </span>
                </div>

                {showError && rowError && "error" in rowError ? (
                  <p role="alert" className="cap-alert">
                    {rowError.error}
                  </p>
                ) : null}

                <div className="stack-2">
                  <h3 className="small strong">Reviewers</h3>
                  {assigned.length === 0 ? (
                    <p className="small cap-muted">None assigned yet.</p>
                  ) : (
                    <ul className="stack-1">
                      {assigned.map((a) => (
                        <li key={a.assignmentId} className="spread small">
                          <span>
                            {a.reviewerName || a.reviewerEmail}{" "}
                            <span
                              className={
                                a.reviewSubmitted
                                  ? "ok-text"
                                  : "cap-muted"
                              }
                            >
                              ({a.reviewSubmitted ? "review submitted" : "assigned"})
                            </span>
                          </span>
                          <Form method="post">
                            <input type="hidden" name="intent" value="unassign" />
                            <input type="hidden" name="abstractId" value={abstract.id} />
                            <input type="hidden" name="assignmentId" value={a.assignmentId} />
                            <button type="submit" className="link-button strong">
                              Unassign
                              <span className="cap-sr-only">
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
                  <Form method="post" className="cluster cluster-end">
                    <input type="hidden" name="intent" value="assign" />
                    <input type="hidden" name="abstractId" value={abstract.id} />
                    <div className="stack-1">
                      <label htmlFor={`reviewer-${abstract.id}`} className="cap-field-label">
                        Add a reviewer
                      </label>
                      <select
                        id={`reviewer-${abstract.id}`}
                        name="reviewerId"
                        defaultValue=""
                        className="cap-select"
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
                      className="cap-btn"
                      data-variant="primary"
                    >
                      Assign
                    </button>
                  </Form>
                ) : reviewers.length > 0 ? (
                  <p className="small cap-muted">
                    Every reviewer on this meeting is already assigned.
                  </p>
                ) : null}

                <p className="small">
                  <Link
                    to={`/admin/editions/${edition.id}/review/${abstract.id}`}
                    className="strong"
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
