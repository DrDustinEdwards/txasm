import { useId, useRef, useState } from "react";
import type { Route } from "./+types/branch-officers";
import { pageTitle } from "~/lib/site-meta";
import {
  ADVISORY_BOARD,
  type Officer,
  OFFICERS,
  PAST_OFFICER_TABS,
  type PastOfficer,
  type PastOfficerTab,
} from "~/lib/officers";

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

function PastOfficerRow({ entry }: { entry: PastOfficer }) {
  return (
    <li className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-28 shrink-0 text-sm font-medium text-text-muted">
        {entry.term ?? "Dates not recorded"}
      </span>
      <span className="text-text">
        {entry.name ? (
          <>
            <span className="font-medium">{entry.name}</span>
            {entry.institution ? (
              <span className="text-text-muted"> &middot; {entry.institution}</span>
            ) : null}
          </>
        ) : (
          <span className="text-text-muted">Not recorded</span>
        )}
      </span>
    </li>
  );
}

// A small, self-contained tab set for the past-officer role histories. Follows
// the WAI-ARIA tabs pattern: a tablist of buttons with roving tabindex, arrow
// and Home/End keys to move (activation follows focus), and one visible panel.
function PastOfficersTabs({ tabs }: { tabs: PastOfficerTab[] }) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  function selectTab(index: number) {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectTab(active + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectTab(active - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab(tabs.length - 1);
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Past branch officers by role"
        className="flex flex-wrap gap-2"
      >
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={onKeyDown}
              className={
                selected
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-panel hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          tabIndex={0}
          hidden={index !== active}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
            {tab.entries.map((entry, entryIndex) => (
              <PastOfficerRow key={`${tab.id}-${entryIndex}`} entry={entry} />
            ))}
          </ul>
        </div>
      ))}
    </div>
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

      <section aria-labelledby="past-officers-heading" className="space-y-4">
        <div className="space-y-2">
          <h2
            id="past-officers-heading"
            className="text-xl font-semibold text-text"
          >
            Past branch officers
          </h2>
          <p className="max-w-2xl text-text-muted">
            A history of those who have led the branch, by role. Choose a role to
            see its record of term, name, and institution.
          </p>
        </div>
        <PastOfficersTabs tabs={PAST_OFFICER_TABS} />
      </section>
    </div>
  );
}
