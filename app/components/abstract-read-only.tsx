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
    decision.outcome === "accept" ? "ok" : decision.outcome === "reject" ? "crit" : "warn";
  return (
    <section role="status" className="cap-banner stack-2" data-tone={tone}>
      <h2 className="subsection-title">Decision</h2>
      <p className="small">
        <span className="strong">Outcome:</span>{" "}
        {DECISION_OUTCOME_LABELS[decision.outcome as DecisionOutcome] ?? decision.outcome}
        {decision.presentationType
          ? ` (${
              PRESENTATION_TYPE_LABELS[decision.presentationType as PresentationType] ??
              decision.presentationType
            } presentation)`
          : ""}
      </p>
      {decision.decisionMessage ? (
        <div className="stack-1">
          <h3 className="small strong">Message from the organizers</h3>
          <div className="small" dangerouslySetInnerHTML={{ __html: decision.decisionMessage }} />
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
    <div className="stack-4">
      {bodyText.trim().length > 0 ? (
        <section className="stack-1">
          <h2 className="small strong">Abstract</h2>
          <div dangerouslySetInnerHTML={{ __html: bodyText }} />
        </section>
      ) : null}
      {authors.length > 0 ? (
        <section className="stack-1">
          <h2 className="small strong">Authors</h2>
          <p>
            {authors
              .map((a) => `${a.firstName} ${a.lastName}`.trim())
              .filter(Boolean)
              .join(", ")}
          </p>
        </section>
      ) : null}
      {affiliations.length > 0 ? (
        <section className="stack-1">
          <h2 className="small strong">Affiliations</h2>
          <ol className="numbered">
            {affiliations.map((a, i) => (
              <li key={i}>{a.institution}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
