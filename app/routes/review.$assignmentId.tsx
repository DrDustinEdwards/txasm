import { Title, Text } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Panel } from "capsomer/react/panel";
import { Banner } from "capsomer/react/banner";
import { FormStatus, useActionStatus } from "capsomer/react/form-status";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/review.$assignmentId";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { forbidden, requireUser } from "~/lib/auth.server";
import {
  DeadlinePassedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  getActor,
  getDataAccess,
} from "~/lib/data-access";
import { DATE_TIME } from "~/lib/format";
import { formatDate } from "capsomer/behavior/time";
import { RichTextField } from "capsomer/react/rich-text-field";
import { BODY_TAGS } from "~/lib/richtext";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT } from "~/lib/form.server";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";
import { RichText } from "capsomer/react/trusted-html";
// Capsomer styles only this page draws, loaded with it rather than on every page (app.css).
import "capsomer/toolbar.css";
import "capsomer/rich-text-field.css";

// An app: the review form and its rich-text comment. It hydrates (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Review abstract"));
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user);
  const da = getDataAccess(env);

  try {
    const data = await da.reviews.getAssignmentForReview(actor, params.assignmentId);
    return data;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw forbidden(request, "review assignment");
    }
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    throw error;
  }
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user);
  const da = getDataAccess(env);
  const form = await readForm(request, FORM_LIMIT);
  const intent = String(form.get("intent") ?? "submit");

  try {
    if (intent === "conflict") {
      const abstractId = String(form.get("abstractId") ?? "");
      const reason = String(form.get("reason") ?? "");
      const note = String(form.get("note") ?? "");
      await da.reviews.declareConflict(actor, { abstractId, reason, note });
      return redirect("/review");
    }

    const recommendation = String(form.get("recommendation") ?? "");
    if (recommendation !== "accept" && recommendation !== "reject" && recommendation !== "revise") {
      return { error: "Choose a recommendation." };
    }

    await da.reviews.submit(actor, {
      assignmentId: params.assignmentId,
      recommendation,
      scores: [],
      overallComment: String(form.get("overallComment") ?? ""),
      confidentialComment: String(form.get("confidentialComment") ?? ""),
    });
    return redirect("/review");
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DeadlinePassedError) {
      return { error: error.message };
    }
    if (error instanceof ForbiddenError) {
      throw forbidden(request, "review assignment");
    }
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    throw error;
  }
}

const RECOMMENDATION_OPTIONS = [
  { value: "accept", label: "Accept" },
  { value: "revise", label: "Revise" },
  { value: "reject", label: "Reject" },
] as const;

function AbstractSections({
  abstract,
}: {
  abstract: {
    background: string;
    methods: string;
    results: string;
    conclusions: string;
    bodyText: string;
  };
}) {
  const sections: Array<[string, string]> = [
    ["Background", abstract.background],
    ["Methods", abstract.methods],
    ["Results", abstract.results],
    ["Conclusions", abstract.conclusions],
    ["Abstract", abstract.bodyText],
  ];
  const filled = sections.filter(([, html]) => html.trim().length > 0);
  if (filled.length === 0) {
    return (
      <Text size="small" tone="muted">
        This abstract has no section content.
      </Text>
    );
  }
  return (
    <Stack>
      {filled.map(([label, html]) => (
        <Stack as="section" key={label} gap={2}>
          <Text as="h3" size="small" weight="strong">
            {label}
          </Text>
          <RichText className="cap-text" data-size="small" html={html} />
        </Stack>
      ))}
    </Stack>
  );
}

export default function ReviewAbstract({ loaderData }: Route.ComponentProps) {
  const { assignment, edition, abstract, authors, review } = loaderData;
  const actionData = useActionData<typeof action>();
  const status = useActionStatus(actionData);
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const authorLine = authors
    .map((a) => `${a.firstName} ${a.lastName}`.trim())
    .filter(Boolean)
    .join(", ");
  const editable = !edition.deadlinePassed;

  return (
    <div className="cap-column cap-stack" data-gap="6">
      <Stack gap={2}>
        <Title as="h1" size={2}>
          <RichText as="span" html={abstract.title} fallback="Untitled abstract" />
        </Title>
        <Text size="small" tone="muted">
          {edition.name}
          {authorLine ? ` . ${authorLine}` : ""}
          {assignment.dueAt ? ` . Due: ${formatDate(assignment.dueAt, DATE_TIME)}` : ""}
        </Text>
      </Stack>

      <Panel title="Abstract">
        <Stack gap={4}>
          <AbstractSections abstract={abstract} />
        </Stack>
      </Panel>

      <FormStatus status={status} />

      {editable ? (
        <Form method="post" className="cap-stack" data-gap="6">
          <input type="hidden" name="intent" value="submit" />

          <Stack as="fieldset" gap={3}>
            <Text as="legend" size="small" weight="strong">
              Recommendation
            </Text>
            <div className="cap-cluster">
              {RECOMMENDATION_OPTIONS.map((option) => (
                <label key={option.value} className="cap-check">
                  <input
                    type="radio"
                    name="recommendation"
                    value={option.value}
                    required
                    defaultChecked={review?.recommendation === option.value}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </Stack>

          <RichTextField
            name="overallComment"
            label="Overall comment"
            tags={BODY_TAGS}
            lines="multi"
            initialHTML={review?.overallComment ?? ""}
            help="Shared with the chairs. Optional."
          />

          <RichTextField
            name="confidentialComment"
            label="Confidential comment to chairs"
            tags={BODY_TAGS}
            lines="multi"
            initialHTML={review?.confidentialComment ?? ""}
            help="Seen only by chairs and admins, never by the authors. Optional."
          />

          <div className="cap-cluster">
            <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
              {review?.status === "submitted" ? "Update review" : "Submit review"}
            </button>
            <Link to="/review" className="cap-text" data-size="small" data-weight="strong">
              Back to review
            </Link>
          </div>
        </Form>
      ) : (
        <Stack>
          <Banner tone="warn">
            The review deadline has passed. This review can no longer be edited.
          </Banner>
          {review ? (
            <Panel title="Your review">
              <Stack gap={3}>
                <Text size="small">
                  <Text as="span" weight="strong">
                    Recommendation:
                  </Text>{" "}
                  {review.recommendation ?? "None"}
                </Text>
                {review.overallComment ? (
                  <Stack gap={2}>
                    <Text as="h3" size="small" weight="strong">
                      Overall comment
                    </Text>
                    <RichText className="cap-text" data-size="small" html={review.overallComment} />
                  </Stack>
                ) : null}
              </Stack>
            </Panel>
          ) : null}
          <Link to="/review" className="cap-text" data-weight="strong">
            Back to review
          </Link>
        </Stack>
      )}

      <Panel title="Have a conflict of interest?">
        <Stack gap={4}>
          <Text size="small" tone="muted">
            If you should not review this abstract, declare a conflict. This removes the assignment
            and the abstract will be reassigned by a chair.
          </Text>
          <Form
            method="post"
            className="cap-stack"
            data-gap="4"
            onSubmit={(e) =>
              confirmSubmit(e, {
                title: "Declare a conflict and remove this assignment?",
                action: "Declare conflict",
              })
            }
          >
            <input type="hidden" name="intent" value="conflict" />
            <input type="hidden" name="abstractId" value={abstract.id} />
            <Stack gap={2}>
              <label htmlFor="reason" className="cap-field-label">
                Reason
              </label>
              <select id="reason" name="reason" defaultValue="colleague" className="cap-select">
                <option value="author">I am an author</option>
                <option value="coauthor">I have co-authored with an author</option>
                <option value="colleague">An author is a close colleague</option>
                <option value="other">Other</option>
              </select>
            </Stack>
            <Stack gap={2}>
              <label htmlFor="note" className="cap-field-label">
                Note (optional)
              </label>
              <textarea id="note" name="note" rows={2} className="cap-input" />
            </Stack>
            <button type="submit" disabled={submitting} className="cap-btn" data-variant="danger">
              I have a conflict
            </button>
          </Form>
        </Stack>
      </Panel>
    </div>
  );
}
