import { Link } from "react-router";
import type { Route } from "./+types/awardees";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Awardees") },
    {
      name: "description",
      content: "Recipients of the Texas Branch ASM awards.",
    },
  ];
}

// Recipients grouped by award. Only the Distinguished Service Award recipients
// were captured from the current site; the presentation awards are named at each
// meeting and are better filled from the program records over time.
// TODO: populate the per-meeting presentation award recipients (year, award,
// recipient, institution) from the program PDFs as they are processed. Do not
// invent recipient names.
type Recipient = {
  name: string;
  institution?: string;
  year?: string;
};

type AwardRecipients = {
  award: string;
  recipients: Recipient[];
};

const AWARD_RECIPIENTS: AwardRecipients[] = [
  {
    award: "Distinguished Service Award",
    recipients: [
      { name: "M. Gabriela Bowden", institution: "University of Houston-Downtown" },
      { name: "Robert (Bob) J. C. McLean", institution: "Texas State University" },
      {
        name: "Millicent Goldschmidt",
        institution: "UT Health Science Center at Houston",
      },
      { name: "L. Joe Berry", institution: "UT Austin" },
    ],
  },
];

export default function Awardees() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Past awardees
        </h1>
        <p className="max-w-2xl text-text-muted">
          Recipients of the branch awards, presented at the spring and fall
          meetings. More recipients are added from the meeting records over time.
        </p>
      </header>

      {AWARD_RECIPIENTS.map((group) => (
        <section
          key={group.award}
          aria-label={group.award}
          className="space-y-4"
        >
          <h2 className="text-xl font-semibold text-text">{group.award}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.recipients.map((recipient) => (
              <li
                key={`${group.award}-${recipient.name}`}
                className="rounded-lg border border-border bg-surface-raised p-4"
              >
                <p className="font-medium text-text">{recipient.name}</p>
                {recipient.institution ? (
                  <p className="mt-1 text-sm text-text-muted">
                    {recipient.institution}
                  </p>
                ) : null}
                {recipient.year ? (
                  <p className="mt-1 text-sm text-text-muted">
                    {recipient.year}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section
        aria-label="Presentation awards"
        className="rounded-lg border border-border bg-panel p-6"
      >
        <p className="text-text-muted">
          Recipients of the student and faculty presentation awards are named at
          each meeting and will be listed here as the records are compiled.
        </p>
        <p className="mt-3 text-sm text-text-muted">
          See the{" "}
          <Link
            to="/awards"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            awards
          </Link>{" "}
          presented each meeting.
        </p>
      </section>
    </div>
  );
}
