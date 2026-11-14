import { Title, Text } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import {
  DECISION_OUTCOME_LABELS,
  type DecisionOutcome,
  PRESENTATION_TYPE_LABELS,
  type PresentationType,
} from "~/lib/vocab";
import { RichText } from "capsomer/react/trusted-html";

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
    <section role="status" className="cap-banner cap-stack" data-gap="3" data-tone={tone}>
      <Title size={5}>Decision</Title>
      <Text size="small">
        <Text as="span" weight="strong">
          Outcome:
        </Text>{" "}
        {DECISION_OUTCOME_LABELS[decision.outcome as DecisionOutcome] ?? decision.outcome}
        {decision.presentationType
          ? ` (${
              PRESENTATION_TYPE_LABELS[decision.presentationType as PresentationType] ??
              decision.presentationType
            } presentation)`
          : ""}
      </Text>
      {decision.decisionMessage ? (
        <Stack gap={2}>
          <Text as="h3" size="small" weight="strong">
            Message from the organizers
          </Text>
          <RichText className="cap-text" data-size="small" html={decision.decisionMessage} />
        </Stack>
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
    <Stack>
      {bodyText.trim().length > 0 ? (
        <Stack as="section" gap={2}>
          <Text as="h2" size="small" weight="strong">
            Abstract
          </Text>
          <RichText html={bodyText} />
        </Stack>
      ) : null}
      {authors.length > 0 ? (
        <Stack as="section" gap={2}>
          <Text as="h2" size="small" weight="strong">
            Authors
          </Text>
          <p>
            {authors
              .map((a) => `${a.firstName} ${a.lastName}`.trim())
              .filter(Boolean)
              .join(", ")}
          </p>
        </Stack>
      ) : null}
      {affiliations.length > 0 ? (
        <Stack as="section" gap={2}>
          <Text as="h2" size="small" weight="strong">
            Affiliations
          </Text>
          <ol className="numbered">
            {affiliations.map((a, i) => (
              <li key={i}>{a.institution}</li>
            ))}
          </ol>
        </Stack>
      ) : null}
    </Stack>
  );
}
