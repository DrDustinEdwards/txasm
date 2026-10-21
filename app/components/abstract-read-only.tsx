import {
  DECISION_OUTCOME_LABELS,
  type DecisionOutcome,
  PRESENTATION_TYPE_LABELS,
  type PresentationType,
} from "~/lib/vocab";

export function DecisionPanel({
  decision,
}: {
  decision: {
    outcome: string;
    presentationType: string | null;
    decisionMessage: string | null;
  } | null;
}) {
  if (!decision) return null;
  const tone =
    decision.outcome === "accept"
      ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
      : decision.outcome === "reject"
        ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
        : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950";
  return (
    <section role="status" className={`space-y-2 rounded-md border p-4 ${tone}`}>
      <h2 className="text-lg font-medium">Decision</h2>
      <p className="text-sm">
        <span className="font-medium">Outcome:</span>{" "}
        {DECISION_OUTCOME_LABELS[decision.outcome as DecisionOutcome] ??
          decision.outcome}
        {decision.presentationType
          ? ` (${
              PRESENTATION_TYPE_LABELS[
                decision.presentationType as PresentationType
              ] ?? decision.presentationType
            } presentation)`
          : ""}
      </p>
      {decision.decisionMessage ? (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Message from the organizers</h3>
          <div
            className="text-sm"
            dangerouslySetInnerHTML={{ __html: decision.decisionMessage }}
          />
        </div>
      ) : null}
    </section>
  );
}

export function ReadOnlyAbstract({
  bodyText,
  authors,
  affiliations,
}: {
  bodyText: string;
  authors: Array<{ firstName: string; lastName: string }>;
  affiliations: Array<{ institution: string }>;
}) {
  return (
    <div className="space-y-4">
      {bodyText.trim().length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium text-text">Abstract</h2>
          <div
            className="text-text"
            dangerouslySetInnerHTML={{ __html: bodyText }}
          />
        </section>
      ) : null}
      {authors.length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium text-text">Authors</h2>
          <p className="text-text">
            {authors
              .map((a) => `${a.firstName} ${a.lastName}`.trim())
              .filter(Boolean)
              .join(", ")}
          </p>
        </section>
      ) : null}
      {affiliations.length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium text-text">Affiliations</h2>
          <ol className="list-decimal pl-5 text-text">
            {affiliations.map((a, i) => (
              <li key={i}>{a.institution}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
