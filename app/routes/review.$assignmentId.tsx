import { useEffect, useRef } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/review.$assignmentId";
import { cloudflareContext } from "~/load-context";
import { requireUser } from "~/lib/auth.server";
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

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Review abstract | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user.id);
  const da = getDataAccess(env);

  try {
    const data = await da.reviews.getAssignmentForReview(
      actor,
      params.assignmentId,
    );
    return data;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw new Response("Forbidden", { status: 403 });
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
  const form = await request.formData();
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
    if (
      recommendation !== "accept" &&
      recommendation !== "reject" &&
      recommendation !== "revise"
    ) {
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
      throw new Response("Forbidden", { status: 403 });
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
      <p className="text-sm text-gray-600 dark:text-gray-400">
        This abstract has no section content.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {filled.map(([label, html]) => (
        <section key={label} className="space-y-1">
          <h3 className="text-sm font-medium">{label}</h3>
          <div className="text-sm" dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      ))}
    </div>
  );
}

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

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
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {abstract.title ? (
            <span dangerouslySetInnerHTML={{ __html: abstract.title }} />
          ) : (
            "Untitled abstract"
          )}
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {edition.name}
          {authorLine ? ` . ${authorLine}` : ""}
          {assignment.dueAt
            ? ` . Due: ${formatDateTime(assignment.dueAt)}`
            : ""}
        </p>
      </div>

      <section className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-lg font-medium">Abstract</h2>
        <AbstractSections abstract={abstract} />
      </section>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={
          error
            ? "rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            : "sr-only"
        }
      >
        {error ?? ""}
      </p>

      {editable ? (
        <Form method="post" className="space-y-6">
          <input type="hidden" name="intent" value="submit" />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Recommendation</legend>
            <div className="flex flex-wrap gap-4">
              {RECOMMENDATION_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="recommendation"
                    value={option.value}
                    required
                    defaultChecked={review?.recommendation === option.value}
                    className="h-4 w-4"
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
          <p id="overall-help" className="text-sm text-gray-600 dark:text-gray-400">
            Shared with the chairs. Optional.
          </p>

          <RichEditor
            name="confidentialComment"
            label="Confidential comment to chairs"
            mode="body"
            initialHTML={review?.confidentialComment ?? ""}
            describedById="confidential-help"
          />
          <p
            id="confidential-help"
            className="text-sm text-gray-600 dark:text-gray-400"
          >
            Seen only by chairs and admins, never by the authors. Optional.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
            >
              {review?.status === "submitted"
                ? "Update review"
                : "Submit review"}
            </button>
            <Link
              to="/review"
              className="text-sm font-medium text-gray-700 hover:underline dark:text-gray-300"
            >
              Back to review
            </Link>
          </div>
        </Form>
      ) : (
        <div className="space-y-4">
          <p
            role="status"
            className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
          >
            The review deadline has passed. This review can no longer be edited.
          </p>
          {review ? (
            <section className="space-y-2 rounded border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="text-lg font-medium">Your review</h2>
              <p className="text-sm">
                <span className="font-medium">Recommendation:</span>{" "}
                {review.recommendation ?? "None"}
              </p>
              {review.overallComment ? (
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Overall comment</h3>
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{ __html: review.overallComment }}
                  />
                </div>
              ) : null}
            </section>
          ) : null}
          <Link
            to="/review"
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Back to review
          </Link>
        </div>
      )}

      <section className="space-y-3 rounded border border-amber-200 p-4 dark:border-amber-900">
        <h2 className="text-lg font-medium">Have a conflict of interest?</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          If you should not review this abstract, declare a conflict. This removes
          the assignment and the abstract will be reassigned by a chair.
        </p>
        <Form
          method="post"
          className="space-y-3"
          onSubmit={(e) => {
            if (!window.confirm("Declare a conflict and remove this assignment?")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="conflict" />
          <input type="hidden" name="abstractId" value={abstract.id} />
          <div className="space-y-1">
            <label htmlFor="reason" className="block text-sm font-medium">
              Reason
            </label>
            <select id="reason" name="reason" defaultValue="colleague" className={inputClass}>
              <option value="author">I am an author</option>
              <option value="coauthor">I have co-authored with an author</option>
              <option value="colleague">An author is a close colleague</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="note" className="block text-sm font-medium">
              Note (optional)
            </label>
            <textarea
              id="note"
              name="note"
              rows={2}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded border border-amber-300 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950"
          >
            I have a conflict
          </button>
        </Form>
      </section>
    </div>
  );
}
