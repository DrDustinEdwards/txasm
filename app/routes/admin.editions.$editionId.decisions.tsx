import { useEffect, useRef, useState } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.decisions";
import { pageTitle } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import { NotFoundError, ValidationError, getDataAccess } from "~/lib/data-access";
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

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Decisions") }];
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
    <div className="stack-6">
      <div className="stack-2">
        <h1 className="page-title">Decisions</h1>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}/review`} className="strong">
            Assign reviewers
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}`} className="strong">
            Edit meeting
          </Link>
        </p>
        <p className="cap-muted">
          Read the reviews, then record a decision. Authors see their decision in the app as soon as
          you save it.
        </p>
      </div>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={error || ok ? "cap-alert" : "cap-sr-only"}
        data-tone={error ? "crit" : "ok"}
      >
        {error ?? ok ?? ""}
      </p>

      {abstracts.length === 0 ? (
        <p>No submitted abstracts yet.</p>
      ) : (
        <ul className="stack-6">
          {abstracts.map((abstract) => (
            <DecisionRow key={abstract.id} editionId={edition.id} abstract={abstract} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Deliberate radio order for the decision action, labeled from the action map.
const OUTCOME_OPTIONS = (["accept", "revise", "reject"] as const).map((value) => ({
  value,
  label: OUTCOME_ACTION_LABELS[value],
}));

function DecisionRow({ editionId, abstract }: { editionId: string; abstract: AbstractRow }) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const decision = abstract.decision;
  const [outcome, setOutcome] = useState<DecisionOutcome>(
    (decision?.outcome as DecisionOutcome) ?? "accept",
  );
  const summary = abstract.recommendationSummary;

  return (
    <li className="card stack-4">
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
          <p className="small cap-muted">
            Status: {ABSTRACT_STATUS_LABELS[abstract.status]} . Reviews: {abstract.reviewCount}{" "}
            (accept {summary.accept} / revise {summary.revise} / reject {summary.reject}) .{" "}
            <Link to={`/admin/editions/${editionId}/review/${abstract.id}`} className="strong">
              Read reviews
            </Link>
          </p>
        </div>
        {decision ? (
          <span className="cap-badge" data-variant="secondary">
            {outcomeLabel(decision.outcome)}
            {decision.presentationType
              ? ` . ${
                  PRESENTATION_TYPE_LABELS[decision.presentationType as PresentationType] ??
                  decision.presentationType
                }`
              : ""}
          </span>
        ) : null}
      </div>

      {decision ? (
        <p className="small cap-muted">
          Current decision recorded {formatDateTime(decision.decidedAt)}.
        </p>
      ) : null}

      {decision ? (
        <div className="stack-1">
          <div className="cluster">
            <Form method="post">
              <input type="hidden" name="intent" value="notify" />
              <input type="hidden" name="abstractId" value={abstract.id} />
              <button type="submit" disabled={submitting} className="cap-btn">
                Notify author
              </button>
            </Form>
            <span className="small cap-muted">
              {decision.notifyState === "emailed"
                ? "Author emailed."
                : decision.notifyState === "in_app"
                  ? "Author notified in-app."
                  : "Not notified yet."}
            </span>
          </div>
          <p className="tiny cap-muted">
            Until email goes live at cutover, this marks the author as notified in-app. The author
            already sees the decision when signed in.
          </p>
        </div>
      ) : null}

      <Form method="post" className="stack-4">
        <input type="hidden" name="intent" value="decide" />
        <input type="hidden" name="abstractId" value={abstract.id} />

        <fieldset className="stack-2">
          <legend className="small strong">Outcome</legend>
          <div className="cluster">
            {OUTCOME_OPTIONS.map((option) => (
              <label key={option.value} className="cap-check">
                <input
                  type="radio"
                  name="outcome"
                  value={option.value}
                  required
                  checked={outcome === option.value}
                  onChange={() => setOutcome(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {outcome === "accept" ? (
          <div className="stack-1">
            <label htmlFor={`presentation-${abstract.id}`} className="cap-field-label">
              Presentation type
            </label>
            <select
              id={`presentation-${abstract.id}`}
              name="presentationType"
              required
              defaultValue={decision?.presentationType ?? "oral"}
              className="cap-select"
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
        <p id={`decision-help-${abstract.id}`} className="small cap-muted">
          Shown to the author with the decision.
        </p>

        <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
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
            className="small strong link-button"
          >
            Clear decision
          </button>
        </Form>
      ) : null}
    </li>
  );
}
