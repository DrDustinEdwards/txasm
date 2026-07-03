import { Link } from "react-router";
import type { Route } from "./+types/awardees";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Awardees") },
    {
      name: "description",
      content:
        "Past recipients of the Texas Branch ASM awards, by year and award.",
    },
  ];
}

// Past recipients, grouped by year. The historical list was not in the vault
// note, so this renders an empty-state until the records are migrated. Keep the
// grouped shape so the archive can be filled in without reworking the markup.
// TODO: migrate the full list of past awardees (year, award, recipient, and
// institution) from the current site or the awards committee records. Do not
// invent recipient names.
type AwardeeYear = {
  year: string;
  recipients: { award: string; name: string; institution?: string }[];
};

const AWARDEES: AwardeeYear[] = [];

export default function Awardees() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Past awardees
        </h1>
        <p className="max-w-2xl text-text-muted">
          Recipients of the branch awards, presented at the spring and fall
          meetings. Records are organized by year.
        </p>
      </header>

      {AWARDEES.length === 0 ? (
        <section
          aria-label="Awardee records"
          className="rounded-lg border border-border bg-panel p-6"
        >
          <p className="text-text-muted">
            The archive of past recipients is being compiled and will appear
            here.
          </p>
          <p className="mt-3 text-sm text-text-muted">
            In the meantime, see the{" "}
            <Link
              to="/awards"
              className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              awards
            </Link>{" "}
            presented each meeting.
          </p>
        </section>
      ) : (
        <div className="space-y-8">
          {AWARDEES.map((group) => (
            <section
              key={group.year}
              aria-label={`Awardees ${group.year}`}
              className="space-y-3"
            >
              <h2 className="text-xl font-semibold text-text">{group.year}</h2>
              <ul className="space-y-2">
                {group.recipients.map((recipient) => (
                  <li
                    key={`${recipient.award}-${recipient.name}`}
                    className="rounded-lg border border-border bg-surface-raised p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {recipient.award}
                    </p>
                    <p className="mt-1 font-medium text-text">
                      {recipient.name}
                    </p>
                    {recipient.institution ? (
                      <p className="mt-1 text-sm text-text-muted">
                        {recipient.institution}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
