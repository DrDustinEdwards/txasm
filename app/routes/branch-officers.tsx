import type { Route } from "./+types/branch-officers";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Branch officers") },
    {
      name: "description",
      content:
        "Current officers, advisory board, and past officers of the Texas Branch of the American Society for Microbiology.",
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

// An advisory board member: name plus institution, no contact block.
type BoardMember = {
  name: string;
  institution: string;
};

// A past officer term: the years served, the name, and the institution as
// carried on the live page. Plain text history, no contact details.
type PastOfficer = {
  term: string;
  name: string;
  institution?: string;
};

type PastOfficerGroup = {
  role: string;
  entries: PastOfficer[];
};

// Current slate and advisory board from the live branch-officers page (source of
// truth), in the order the page lists them.
const OFFICERS: Officer[] = [
  {
    role: "President",
    name: "Natasha Kirienko",
    affiliation: "Department of BioSciences, Rice University",
    location: "Houston, TX 77251-1892",
    phone: "713-348-2581",
    email: "kirienko@rice.edu",
  },
  {
    role: "Councilor",
    name: "Heidi Kaplan",
    affiliation:
      "Department of Microbiology and Molecular Genetics, McGovern Medical School, University of Texas Health Science Center at Houston",
    location: "Houston, TX 77030",
    phone: "713-500-5448",
    email: "Heidi.B.Kaplan@uth.tmc.edu",
  },
  {
    role: "President-Elect",
    name: "James Masuoka",
    affiliation: "Department of Biology, Midwestern State University",
    location: "Wichita Falls, TX 76308",
    phone: "940-397-4181",
    email: "james.masuoka@msutexas.edu",
  },
  {
    role: "Secretary",
    name: "William Cody",
    affiliation: "Department of Biology, University of Dallas",
    location: "Irving, TX 75062",
    phone: "972-721-5192",
    email: "wcody@udallas.edu",
  },
  {
    role: "Treasurer",
    name: "Patricia Baynham",
    affiliation: "Department of Biology, St. Edward's University",
    location: "Austin, TX 78704",
    phone: "512-233-1675",
    email: "patricib@stedwards.edu",
  },
  {
    role: "Archivist",
    name: "Dustin Edwards",
    affiliation: "Department of Biological Sciences, Tarleton State University",
    location: "Stephenville, TX 76402",
    phone: "254-968-9153",
    email: "dcedwards@tarleton.edu",
  },
];

const ADVISORY_BOARD: BoardMember[] = [
  { name: "Lee Hughes", institution: "University of North Texas" },
  { name: "Madhusudan Choudhary", institution: "Sam Houston State University" },
  { name: "Robert McLean", institution: "Texas State University" },
  { name: "Kelli Palmer", institution: "University of Texas at Dallas" },
  {
    name: "Kendra Rumbaugh",
    institution: "Texas Tech University Health Science Center",
  },
  { name: "Ali Azghani", institution: "University of Texas at Tyler" },
  { name: "Todd Primm", institution: "Sam Houston State University" },
];

// Past Branch Officers history. Only the Presidents list is in the vault note.
// TODO: the live page also carries historical Vice Presidents, Secretaries,
// Treasurers, Councilors, and Alternate Councilors (year/name/institution,
// spanning 1941 to 2021). Add those groups here once the full lists are fetched.
const PAST_OFFICERS: PastOfficerGroup[] = [
  {
    role: "Presidents",
    entries: [
      {
        term: "2024-2025",
        name: "Gregory Frederick",
        institution: "American University of the Caribbean School of Medicine",
      },
      { term: "2022-2023", name: "Kelly Palmer", institution: "UT Dallas" },
      {
        term: "2019-2021",
        name: "Madhusudan Choudhary",
        institution: "Sam Houston State",
      },
      { term: "2017-2018", name: "Lee Hughes", institution: "UNT" },
      { term: "2015-2016", name: "Ali Azghani", institution: "UT Tyler" },
      {
        term: "2013-2014",
        name: "Kendra Rumbaugh",
        institution: "TTU Health Sciences Center",
      },
      { term: "2011-2012", name: "Todd Primm", institution: "Sam Houston State" },
      { term: "2009-2010", name: "Marvin Whiteley", institution: "UT Austin" },
      {
        term: "2007-2008",
        name: "Poonam Gulati",
        institution: "University of Houston-Downtown",
      },
      {
        term: "2005-2006",
        name: "Heidi Kaplan",
        institution: "UT Medical School at Houston",
      },
      { term: "2003-2004", name: "Robert McLean", institution: "Texas State" },
      {
        term: "2001-2002",
        name: "Karl Klose",
        institution: "UT Health Science Center at San Antonio",
      },
      { term: "1999-2000", name: "James Stewart", institution: "UT Tyler" },
      { term: "1997-1998", name: "Alfred G. Brown" },
      {
        term: "1993-1994",
        name: "Mollie McBride",
        institution: "Baylor College of Medicine",
      },
      {
        term: "1991-1992",
        name: "Mary Pat Moyer",
        institution: "UT HSC San Antonio",
      },
      { term: "1990-1991", name: "James Walker", institution: "UT Austin" },
      {
        term: "1988-1989",
        name: "Thomas Huber",
        institution: "Olin E. Teague Veterans' Medical Center",
      },
      {
        term: "1987-1988",
        name: "Charles Gauntt",
        institution: "UT HSC San Antonio",
      },
      { term: "1986-1987", name: "Rex Moyer", institution: "Trinity University" },
      { term: "1985-1986", name: "A. Stephen Kester", institution: "UNT" },
      { term: "1984-1985", name: "L. Joe Berry", institution: "UT Austin" },
      {
        term: "1983-1984",
        name: "David N. McMurray",
        institution: "Texas A&M College Station",
      },
      {
        term: "1982-1983",
        name: "William C. McDonald",
        institution: "UT Arlington",
      },
      {
        term: "1981-1982",
        name: "Johnny Peterson",
        institution: "UT Medical Branch",
      },
      {
        term: "1980-1981",
        name: "Millicent Goldschmidt",
        institution: "UT HSC Houston",
      },
      {
        term: "1979-1980",
        name: "Thomas Matney",
        institution: "UT HSC Houston",
      },
      { term: "1978-1979", name: "B.G. Foster", institution: "UNT" },
      { term: "1977-1978", name: "G. Roland Vela", institution: "UNT" },
      { term: "1976", name: "Lyle Kuhnley", institution: "UT San Antonio" },
      {
        term: "1973-1975",
        name: "Richard A. Finkelstein",
        institution: "UT Southwestern",
      },
      {
        term: "1972-1973",
        name: "Peter Jurushuk",
        institution: "University of Houston",
      },
      { term: "1969-1971", name: "L. J. Rode", institution: "UT Austin" },
      {
        term: "1969",
        name: "Rufus Guthrie",
        institution: "Texas A&M College Station",
      },
      {
        term: "1968-1969",
        name: "Irving Davis",
        institution: "USAF School of Aerospace Medicine",
      },
      {
        term: "1966-1967",
        name: "Eugene Rosenblum",
        institution: "UT Southwestern",
      },
      { term: "1965", name: "E. O. Bennett", institution: "University of Houston" },
      {
        term: "1964",
        name: "Willson J. Fahlberg",
        institution: "Baylor College of Medicine",
      },
      {
        term: "1963",
        name: "Willard F. Verwey",
        institution: "UT Medical Branch",
      },
      { term: "1962", name: "Isaac Peters", institution: "Texas Dept of Health" },
      {
        term: "1961",
        name: "J.B. Davis",
        institution: "Baylor College of Medicine",
      },
      { term: "1960", name: "J.A. Bass", institution: "Texas Dept of Health" },
      { term: "1959", name: "Jackson W. Foster", institution: "UT Austin" },
      {
        term: "1958",
        name: "Roland B. Mitchell",
        institution: "Texas Christian University",
      },
      {
        term: "1957",
        name: "Paul Donaldson",
        institution: "Texas Dept of Health",
      },
      {
        term: "1956",
        name: "Robert P. Williams",
        institution: "Baylor College of Medicine",
      },
      {
        term: "1955",
        name: "Robert M. Pike",
        institution: "UT Southwestern",
      },
      { term: "1954", name: "Orville Wyss", institution: "UT Austin" },
      { term: "1953", name: "J.B. McBryde", institution: "Texas Dept of Health" },
      {
        term: "1952",
        name: "Eula B.M. Cook",
        institution: "UT Medical Branch",
      },
      { term: "1951", name: "Sara E. Sulkin", institution: "UT Southwestern" },
      { term: "1950", name: "Charles E. Lankford", institution: "UT Austin" },
      {
        term: "1949",
        name: "John V. Irons",
        institution: "Texas Dept of Health",
      },
      {
        term: "1948",
        name: "Kenneth L. Burdon",
        institution: "Baylor College of Medicine",
      },
      {
        term: "1947",
        name: "Victor T. Schuhardt",
        institution: "UT Austin",
      },
      {
        term: "1946",
        name: "MacDonald Fulton",
        institution: "UT Medical Branch",
      },
      { term: "1945", name: "O.B. Williams", institution: "UT Austin" },
      { term: "1943-1944", name: "S.W. Bohls", institution: "UT Austin" },
      { term: "1941-1942", name: "I.M. Lewis", institution: "UT Austin" },
    ],
  },
];

function OfficerCard({ officer }: { officer: Officer }) {
  return (
    <article className="rounded-lg border border-border bg-surface-raised p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {officer.role}
      </p>
      <h3 className="mt-1 text-lg font-semibold text-text">{officer.name}</h3>
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

export default function BranchOfficers() {
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

      <section aria-labelledby="advisory-board-heading" className="space-y-4">
        <h2
          id="advisory-board-heading"
          className="text-xl font-semibold text-text"
        >
          Advisory board
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ADVISORY_BOARD.map((member) => (
            <li
              key={member.name}
              className="rounded-lg border border-border bg-surface-raised p-4"
            >
              <p className="font-medium text-text">{member.name}</p>
              <p className="mt-1 text-sm text-text-muted">
                {member.institution}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="past-officers-heading" className="space-y-6">
        <div className="space-y-2">
          <h2
            id="past-officers-heading"
            className="text-xl font-semibold text-text"
          >
            Past branch officers
          </h2>
          <p className="max-w-2xl text-text-muted">
            A history of those who have led the branch. The full presidents list
            appears below; the live site also carries vice presidents,
            secretaries, treasurers, councilors, and alternate councilors, which
            will be added here.
          </p>
        </div>

        {PAST_OFFICERS.map((group) => (
          <div key={group.role} className="space-y-3">
            <h3 className="text-lg font-semibold text-text">{group.role}</h3>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
              {group.entries.map((entry) => (
                <li
                  key={`${entry.term}-${entry.name}`}
                  className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <span className="w-24 shrink-0 text-sm font-medium text-text-muted">
                    {entry.term}
                  </span>
                  <span className="text-text">
                    <span className="font-medium">{entry.name}</span>
                    {entry.institution ? (
                      <span className="text-text-muted">
                        {" "}
                        &middot; {entry.institution}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
