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
  affiliation: string;
  location: string;
  phone?: string;
  email?: string;
};

// A past president: name plus the institution carried on the roster. These have
// no contact details on the current site, so the block is intentionally lighter.
type PastPresident = {
  name: string;
  institution: string;
};

// Roster from the Spring 2026 program. The public officers page only listed the
// President and Councilor; the program PDF carries the full slate used here.
// TODO: confirm the roster is current if it changes after Spring 2026.
const OFFICERS: Officer[] = [
  {
    role: "President",
    name: "Natasha Kirienko, PhD",
    affiliation: "Department of BioSciences, Rice University",
    location: "Houston, TX",
    phone: "713-348-2581",
    email: "kirienko@rice.edu",
  },
  {
    role: "President-Elect",
    name: "James Masuoka, PhD",
    affiliation: "Department of Biology, Midwestern State University",
    location: "Wichita Falls, TX",
    phone: "940-397-4181",
    email: "james.masuoka@msutexas.edu",
  },
  {
    role: "Secretary",
    name: "William Cody, PhD",
    affiliation: "Department of Biology, University of Dallas",
    location: "Irving, TX",
    phone: "972-721-5192",
    email: "wcody@udallas.edu",
  },
  {
    role: "Treasurer",
    name: "Patricia Baynham, PhD",
    affiliation: "Department of Biology, St. Edward's University",
    location: "Austin, TX",
    phone: "512-233-1675",
    email: "patricib@stedwards.edu",
  },
  {
    role: "Councilor",
    name: "Heidi Kaplan, PhD",
    affiliation:
      "Department of Microbiology and Molecular Genetics, McGovern Medical School, UT Health Science Center at Houston",
    location: "Houston, TX",
    phone: "713-500-5448",
    email: "Heidi.B.Kaplan@uth.tmc.edu",
  },
];

const PAST_PRESIDENTS: PastPresident[] = [
  { name: "Kelli Palmer", institution: "UT Dallas" },
  { name: "Madhusudan Choudhary", institution: "Sam Houston State University" },
  { name: "Lee Hughes", institution: "University of North Texas" },
  { name: "Ali Azghani", institution: "UT Tyler" },
  {
    name: "Gregory Frederick",
    institution: "AUC School of Medicine, Sint Maarten",
  },
];

function OfficerCard({ officer }: { officer: Officer }) {
  return (
    <article className="rounded-lg border border-border bg-surface-raised p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {officer.role}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-text">{officer.name}</h2>
      <p className="mt-1 text-sm text-text-muted">{officer.affiliation}</p>
      <p className="text-sm text-text-muted">{officer.location}</p>
      <div className="mt-3 space-y-1 text-sm">
        {officer.phone ? (
          <p>
            <a
              href={`tel:${officer.phone}`}
              className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {officer.phone}
            </a>
          </p>
        ) : null}
        {officer.email ? (
          <p>
            <a
              href={`mailto:${officer.email}`}
              className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {officer.email}
            </a>
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default function Officers() {
  return (
    <div className="space-y-10">
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

      <section aria-labelledby="current-officers-heading" className="space-y-4">
        <h2
          id="current-officers-heading"
          className="text-xl font-semibold text-text"
        >
          Current officers
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {OFFICERS.map((officer) => (
            <li key={`${officer.role}-${officer.name}`}>
              <OfficerCard officer={officer} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="past-presidents-heading" className="space-y-4">
        <h2
          id="past-presidents-heading"
          className="text-xl font-semibold text-text"
        >
          Immediate past presidents
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {PAST_PRESIDENTS.map((person) => (
            <li
              key={person.name}
              className="rounded-lg border border-border bg-surface-raised p-4"
            >
              <p className="font-medium text-text">{person.name}</p>
              <p className="mt-1 text-sm text-text-muted">
                {person.institution}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
