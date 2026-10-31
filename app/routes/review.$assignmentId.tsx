import { useEffect, useRef } from "react";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/review.$assignmentId";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { forbidden, requireUser } from "~/lib/auth.server";
import {
  DeadlinePassedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  getActor,
  getDataAccess,
} from "~/lib/data-access";
import { formatDateTime } from "~/lib/format";
import { RichEditor } from "~/components/rich-editor";
import { readForm } from "~/lib/form.server";

// An app: the review form and its rich-text comment. It hydrates (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Review abstract");
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user.id);
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
  const actor = await getActor(env, user.id);
  const da = getDataAccess(env);
  const form = await readForm(request);
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
    return <p className="small cap-muted">This abstract has no section content.</p>;
  }
  return (
    <div className="stack-4">
      {filled.map(([label, html]) => (
        <section key={label} className="stack-1">
          <h3 className="small strong">{label}</h3>
          <div className="small" dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      ))}
    </div>
  );
}

export default function ReviewAbstract({ loaderData }: Route.ComponentProps) {
  const { assignment, edition, abstract, authors, review } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (actionData) statusRef.current?.focus();
  }, [actionData]);

  const authorLine = authors
    .map((a) => `${a.firstName} ${a.lastName}`.trim())
    .filter(Boolean)
    .join(", ");
  const editable = !edition.deadlinePassed;

  return (
    <div className="form-page stack-6">
      <div className="stack-1">
        <h1 className="page-title">
          {abstract.title ? (
            <span dangerouslySetInnerHTML={{ __html: abstract.title }} />
          ) : (
            "Untitled abstract"
          )}
        </h1>
        <p className="small cap-muted">
          {edition.name}
          {authorLine ? ` . ${authorLine}` : ""}
          {assignment.dueAt ? ` . Due: ${formatDateTime(assignment.dueAt)}` : ""}
        </p>
      </div>

      <section className="card stack-3">
        <h2 className="subsection-title">Abstract</h2>
        <AbstractSections abstract={abstract} />
      </section>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={error ? "cap-alert" : "cap-sr-only"}
      >
        {error ?? ""}
      </p>

      {editable ? (
        <Form method="post" className="stack-6">
          <input type="hidden" name="intent" value="submit" />

          <fieldset className="stack-2">
            <legend className="small strong">Recommendation</legend>
            <div className="cluster">
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
          </fieldset>

          <RichEditor
            name="overallComment"
            label="Overall comment"
            mode="body"
            initialHTML={review?.overallComment ?? ""}
            describedById="overall-help"
          />
          <p id="overall-help" className="small cap-muted">
            Shared with the chairs. Optional.
          </p>

          <RichEditor
            name="confidentialComment"
            label="Confidential comment to chairs"
            mode="body"
            initialHTML={review?.confidentialComment ?? ""}
            describedById="confidential-help"
          />
          <p id="confidential-help" className="small cap-muted">
            Seen only by chairs and admins, never by the authors. Optional.
          </p>

          <div className="cluster">
            <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
              {review?.status === "submitted" ? "Update review" : "Submit review"}
            </button>
            <Link to="/review" className="small strong">
              Back to review
            </Link>
          </div>
        </Form>
      ) : (
        <div className="stack-4">
          <p role="status" className="card card-s card-sunken small">
            The review deadline has passed. This review can no longer be edited.
          </p>
          {review ? (
            <section className="card stack-2">
              <h2 className="subsection-title">Your review</h2>
              <p className="small">
                <span className="strong">Recommendation:</span> {review.recommendation ?? "None"}
              </p>
              {review.overallComment ? (
                <div className="stack-1">
                  <h3 className="small strong">Overall comment</h3>
                  <div
                    className="small"
                    dangerouslySetInnerHTML={{ __html: review.overallComment }}
                  />
                </div>
              ) : null}
            </section>
          ) : null}
          <Link to="/review" className="strong">
            Back to review
          </Link>
        </div>
      )}

      <section className="card card-warn stack-3">
        <h2 className="subsection-title">Have a conflict of interest?</h2>
        <p className="small cap-muted">
          If you should not review this abstract, declare a conflict. This removes the assignment
          and the abstract will be reassigned by a chair.
        </p>
        <Form
          method="post"
          className="stack-3"
          onSubmit={(e) => {
            if (!window.confirm("Declare a conflict and remove this assignment?")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="conflict" />
          <input type="hidden" name="abstractId" value={abstract.id} />
          <div className="stack-1">
            <label htmlFor="reason" className="cap-field-label">
              Reason
            </label>
            <select id="reason" name="reason" defaultValue="colleague" className="cap-select">
              <option value="author">I am an author</option>
              <option value="coauthor">I have co-authored with an author</option>
              <option value="colleague">An author is a close colleague</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="stack-1">
            <label htmlFor="note" className="cap-field-label">
              Note (optional)
            </label>
            <textarea id="note" name="note" rows={2} className="cap-input" />
          </div>
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="danger">
            I have a conflict
          </button>
        </Form>
      </section>
    </div>
  );
}
