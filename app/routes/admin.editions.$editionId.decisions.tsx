import { useEffect, useRef, useState } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.decisions";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import {
  NotFoundError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";
import {
  ABSTRACT_STATUS_LABELS,
  DECISION_OUTCOMES,
  PRESENTATION_TYPES,
  PRESENTATION_TYPE_LABELS,
  type DecisionOutcome,
  type PresentationType,
} from "~/lib/vocab";
import { formatDateTime } from "~/lib/format";
import { RichEditor } from "~/components/rich-editor";
import { decisionEmail, sendEmail } from "~/lib/email.server";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Decisions | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const abstracts = await da.decisions.listForEdition(actor, params.editionId);
  return { edition: { id: edition.id, name: edition.name }, abstracts };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const abstractId = String(form.get("abstractId") ?? "");

  try {
    if (intent === "notify") {
      const result = await da.decisions.notifyAuthor(actor, abstractId, (payload) =>
        sendEmail(env, { to: payload.to, ...decisionEmail(payload) }),
      );
      return {
        ok: result.sent
          ? "The author was emailed the decision."
          : "The author is marked notified in-app. Email goes live at cutover.",
        abstractId,
      };
    }

    if (intent === "clear") {
      if (abstractId) await da.decisions.clearDecision(actor, abstractId);
      return { ok: "Decision cleared.", abstractId };
    }

    if (intent === "decide") {
      const outcomeRaw = String(form.get("outcome") ?? "");
      if (!(DECISION_OUTCOMES as readonly string[]).includes(outcomeRaw)) {
        return { error: "Choose accept, reject, or revise.", abstractId };
      }
      const presentationRaw = String(form.get("presentationType") ?? "");
      const presentationType: PresentationType | null = (
        PRESENTATION_TYPES as readonly string[]
      ).includes(presentationRaw)
        ? (presentationRaw as PresentationType)
        : null;

      await da.decisions.setDecision(actor, {
        abstractId,
        outcome: outcomeRaw as DecisionOutcome,
        presentationType,
        decisionMessage: String(form.get("decisionMessage") ?? ""),
      });
      return { ok: "Decision saved.", abstractId };
    }
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { error: error.message, abstractId };
    }
    throw error;
  }

  return { error: "Unknown action.", abstractId };
}

// Imperative labels for the decision action UI, deliberately distinct from the
// past-tense author-facing DECISION_OUTCOME_LABELS in vocab. Ordered for the
// radio group.
const OUTCOME_ACTION_LABELS: Record<DecisionOutcome, string> = {
  accept: "Accept",
  revise: "Revise",
  reject: "Reject",
};

function outcomeLabel(value: string) {
  return OUTCOME_ACTION_LABELS[value as DecisionOutcome] ?? value;
}

type AbstractRow = Route.ComponentProps["loaderData"]["abstracts"][number];

export default function Decisions({ loaderData }: Route.ComponentProps) {
  const { edition, abstracts } = loaderData;
  const actionData = useActionData<typeof action>();

  const statusRef = useRef<HTMLParagraphElement>(null);
  const error = actionData && "error" in actionData ? actionData.error : null;
  const ok = actionData && "ok" in actionData ? actionData.ok : null;

  useEffect(() => {
    if (actionData) statusRef.current?.focus();
  }, [actionData]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Decisions</h1>
        <p className="text-gray-700 dark:text-gray-300">
          {edition.name}.{" "}
          <Link
            to={`/admin/editions/${edition.id}/review`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Assign reviewers
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link
            to={`/admin/editions/${edition.id}`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Edit meeting
          </Link>
        </p>
        <p className="text-gray-600 dark:text-gray-400">
          Read the reviews, then record a decision. Authors see their decision in
          the app as soon as you save it.
        </p>
      </div>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={
          error
            ? "rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            : ok
              ? "rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
              : "sr-only"
        }
      >
        {error ?? ok ?? ""}
      </p>

      {abstracts.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          No submitted abstracts yet.
        </p>
      ) : (
        <ul className="space-y-6">
          {abstracts.map((abstract) => (
            <DecisionRow
              key={abstract.id}
              editionId={edition.id}
              abstract={abstract}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const inputClass =
  "rounded border border-gray-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

// Deliberate radio order for the decision action, labeled from the action map.
const OUTCOME_OPTIONS = (["accept", "revise", "reject"] as const).map(
  (value) => ({ value, label: OUTCOME_ACTION_LABELS[value] }),
);

function DecisionRow({
  editionId,
  abstract,
}: {
  editionId: string;
  abstract: AbstractRow;
}) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const decision = abstract.decision;
  const [outcome, setOutcome] = useState<DecisionOutcome>(
    (decision?.outcome as DecisionOutcome) ?? "accept",
  );
  const summary = abstract.recommendationSummary;

  return (
    <li className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-medium">
            {abstract.title ? (
              <span dangerouslySetInnerHTML={{ __html: abstract.title }} />
            ) : (
              <span className="text-gray-500">Untitled</span>
            )}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {abstract.authorNames.length > 0
              ? abstract.authorNames.join(", ")
              : "No authors listed"}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Status: {ABSTRACT_STATUS_LABELS[abstract.status]} . Reviews:{" "}
            {abstract.reviewCount}{" "}
            (accept {summary.accept} / revise {summary.revise} / reject{" "}
            {summary.reject}) .{" "}
            <Link
              to={`/admin/editions/${editionId}/review/${abstract.id}`}
              className="font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Read reviews
            </Link>
          </p>
        </div>
        {decision ? (
          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {outcomeLabel(decision.outcome)}
            {decision.presentationType
              ? ` . ${
                  PRESENTATION_TYPE_LABELS[
                    decision.presentationType as PresentationType
                  ] ?? decision.presentationType
                }`
              : ""}
          </span>
        ) : null}
      </div>

      {decision ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Current decision recorded {formatDateTime(decision.decidedAt)}.
        </p>
      ) : null}

      {decision ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <Form method="post">
              <input type="hidden" name="intent" value="notify" />
              <input type="hidden" name="abstractId" value={abstract.id} />
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
              >
                Notify author
              </button>
            </Form>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {decision.notifyState === "emailed"
                ? "Author emailed."
                : decision.notifyState === "in_app"
                  ? "Author notified in-app."
                  : "Not notified yet."}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Until email goes live at cutover, this marks the author as notified
            in-app. The author already sees the decision when signed in.
          </p>
        </div>
      ) : null}

      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="decide" />
        <input type="hidden" name="abstractId" value={abstract.id} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Outcome</legend>
          <div className="flex flex-wrap gap-4">
            {OUTCOME_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="outcome"
                  value={option.value}
                  required
                  checked={outcome === option.value}
                  onChange={() => setOutcome(option.value)}
                  className="h-4 w-4"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {outcome === "accept" ? (
          <div className="space-y-1">
            <label
              htmlFor={`presentation-${abstract.id}`}
              className="block text-sm font-medium"
            >
              Presentation type
            </label>
            <select
              id={`presentation-${abstract.id}`}
              name="presentationType"
              required
              defaultValue={decision?.presentationType ?? "oral"}
              className={inputClass}
            >
              {PRESENTATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PRESENTATION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <RichEditor
          name="decisionMessage"
          label="Message to the author (optional)"
          mode="body"
          initialHTML={decision?.decisionMessage ?? ""}
          describedById={`decision-help-${abstract.id}`}
        />
        <p
          id={`decision-help-${abstract.id}`}
          className="text-sm text-gray-600 dark:text-gray-400"
        >
          Shown to the author with the decision.
        </p>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
        >
          {decision ? "Update decision" : "Save decision"}
        </button>
      </Form>

      {decision ? (
        <Form method="post">
          <input type="hidden" name="intent" value="clear" />
          <input type="hidden" name="abstractId" value={abstract.id} />
          <button
            type="submit"
            disabled={submitting}
            onClick={(e) => {
              if (!window.confirm("Clear this decision?")) e.preventDefault();
            }}
            className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
          >
            Clear decision
          </button>
        </Form>
      ) : null}
    </li>
  );
}
