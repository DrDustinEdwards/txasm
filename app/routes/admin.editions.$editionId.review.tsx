import { Title, Text } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import { Form, useActionData, useNavigation } from "react-router";
import { Banner } from "capsomer/react/banner";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.review";
import { pageTitle } from "~/lib/site-meta";
import { titleCase } from "@drdustinedwards/site-helpers/text";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireChair } from "~/lib/auth.server";
import {
  ConflictOfInterestError,
  NotFoundError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT } from "~/lib/form.server";
import { RichText } from "capsomer/react/trusted-html";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Assign reviewers"));
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
  const form = await readForm(request, FORM_LIMIT);
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
    <Stack gap={6}>
      <Stack gap={3}>
        <Title as="h1" size={2}>
          Assign reviewers
        </Title>
        <p>
          {edition.name}.{" "}
          <Link
            to={`/admin/editions/${edition.id}/roles`}
            className="cap-text"
            data-weight="strong"
          >
            Chairs and reviewers
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}`} className="cap-text" data-weight="strong">
            Edit meeting
          </Link>
        </p>
      </Stack>

      {reviewers.length === 0 ? (
        <Banner tone="info">
          No reviewers on this meeting yet. Add reviewers first under Chairs and reviewers.
        </Banner>
      ) : null}

      {abstracts.length === 0 ? (
        <p>No submitted abstracts yet.</p>
      ) : (
        <Stack as="ul">
          {abstracts.map((abstract) => {
            const assigned = byAbstract.get(abstract.id) ?? [];
            const assignedIds = new Set(assigned.map((a) => a.reviewerId));
            const available = reviewers.filter((r) => !assignedIds.has(r.userId));
            const showError =
              rowError && "abstractId" in rowError ? rowError.abstractId === abstract.id : false;

            return (
              <li key={abstract.id} className="cap-panel">
                <div className="cap-panel-body cap-stack" data-gap="4">
                  <div className="cap-spread">
                    <Stack gap={2}>
                      <Text as="h2" weight="strong">
                        <RichText
                          as="span"
                          html={abstract.title}
                          fallback={<span className="cap-muted">Untitled</span>}
                        />
                      </Text>
                      <Text size="small" tone="muted">
                        {abstract.authorNames.length > 0
                          ? abstract.authorNames.join(", ")
                          : "No authors listed"}
                      </Text>
                    </Stack>
                    <span className="cap-badge" data-variant="secondary">
                      {titleCase(abstract.status)}
                    </span>
                  </div>

                  {showError && rowError && "error" in rowError ? (
                    <p role="alert" className="cap-alert">
                      {rowError.error}
                    </p>
                  ) : null}

                  <Stack gap={3}>
                    <Text as="h3" size="small" weight="strong">
                      Reviewers
                    </Text>
                    {assigned.length === 0 ? (
                      <Text size="small" tone="muted">
                        None assigned yet.
                      </Text>
                    ) : (
                      <Stack as="ul" gap={2}>
                        {assigned.map((a) => (
                          <Text as="li" key={a.assignmentId} size="small" className="cap-spread">
                            <span>
                              {a.reviewerName || a.reviewerEmail}{" "}
                              <Text as="span" data-tone={a.reviewSubmitted ? "ok" : "muted"}>
                                ({a.reviewSubmitted ? "review submitted" : "assigned"})
                              </Text>
                            </span>
                            <Form method="post">
                              <input type="hidden" name="intent" value="unassign" />
                              <input type="hidden" name="abstractId" value={abstract.id} />
                              <input type="hidden" name="assignmentId" value={a.assignmentId} />
                              <button
                                type="submit"
                                className="cap-btn"
                                data-variant="link"
                                data-size="sm"
                              >
                                Unassign
                                <span className="cap-sr-only">
                                  {" "}
                                  {a.reviewerName || a.reviewerEmail}
                                </span>
                              </button>
                            </Form>
                          </Text>
                        ))}
                      </Stack>
                    )}
                  </Stack>

                  {available.length > 0 ? (
                    <Form method="post" className="cap-cluster" data-align="end">
                      <input type="hidden" name="intent" value="assign" />
                      <input type="hidden" name="abstractId" value={abstract.id} />
                      <Stack gap={2}>
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
                      </Stack>
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
                    <Text size="small" tone="muted">
                      Every reviewer on this meeting is already assigned.
                    </Text>
                  ) : null}

                  <Text size="small">
                    <Link
                      to={`/admin/editions/${edition.id}/review/${abstract.id}`}
                      className="cap-text"
                      data-weight="strong"
                    >
                      Read reviews ({abstract.reviewCount})
                    </Link>
                  </Text>
                </div>
              </li>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
