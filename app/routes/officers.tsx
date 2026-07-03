import type { Route } from "./+types/officers";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Officers") },
    {
      name: "description",
      content:
        "Current officers of the Texas Branch of the American Society for Microbiology.",
    },
  ];
}

// One officer's record. Kept as a flat shape so a later pass can source this
// list from a person model without reworking the markup.
type Officer = {
  role: string;
  name: string;
  institution: string;
  email?: string;
};

// Roster from the current site capture (branch-officers). Only President and
// Councilor were captured in the vault note; the remaining seats need the full
// roster migrated before this page is complete.
// TODO: migrate the complete officer roster (Secretary, Treasurer, President
// Elect, Past President, student representatives, and any others) from the live
// /branch-officers page.
const OFFICERS: Officer[] = [
  {
    role: "President",
    name: "Natasha Kirienko",
    institution: "Rice University",
    email: "kirienko@rice.edu",
  },
  {
    role: "Councilor",
    name: "Heidi Kaplan",
    institution: "McGovern Medical School, UTHealth Houston",
    email: "Heidi.B.Kaplan@uth.tmc.edu",
  },
];

function OfficerCard({ officer }: { officer: Officer }) {
  return (
    <article className="rounded-lg border border-border bg-surface-raised p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {officer.role}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-text">{officer.name}</h2>
      <p className="mt-1 text-sm text-text-muted">{officer.institution}</p>
      {officer.email ? (
        <p className="mt-3 text-sm">
          <a
            href={`mailto:${officer.email}`}
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {officer.email}
          </a>
        </p>
      ) : null}
    </article>
  );
}

export default function Officers() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Branch officers
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch is run by elected officers and volunteers from member
          institutions across Texas. They organize the twice-yearly meetings,
          steward the awards program, and represent Texas microbiologists to the
          national society.
        </p>
      </header>

      <section aria-label="Officer roster">
        <ul className="grid gap-4 sm:grid-cols-2">
          {OFFICERS.map((officer) => (
            <li key={`${officer.role}-${officer.name}`}>
              <OfficerCard officer={officer} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
