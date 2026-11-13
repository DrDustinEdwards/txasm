import { Tabs, TabsContent, TabsList, TabsTrigger } from "capsomer/react/tabs";
import { Row, RowList } from "capsomer/react/row-list";
import { Panel } from "capsomer/react/panel";
import type { Route } from "./+types/branch-officers";
import { pageHead } from "~/lib/site-meta";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import {
  getDataAccess,
  type Officer,
  type PastOfficer,
  type PastOfficerTab,
} from "~/lib/data-access";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

// The page reads the officers table; admins edit it at /admin/officers.
export async function loader({ context }: Route.LoaderArgs) {
  return getDataAccess(context.get(cloudflareContext).env).branchOfficers.getPage();
}

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/branch-officers",
    name: "Branch officers",
    description:
      "Current officers, advisory board, and past officers of the Texas Branch of the American Society for Microbiology.",
  });
}

function OfficerCard({ officer }: { officer: Officer }) {
  return (
    <article className="cap-card">
      <header>
        <p className="cap-label">{officer.role}</p>
        <h3>{officer.name}</h3>
      </header>
      <div>
        <p className="small cap-muted">{officer.affiliation}</p>
        <p className="small cap-muted">{officer.location}</p>
        <div className="cap-stack small officer-contact" data-gap="2">
          {officer.phone ? (
            <p>
              <a href={`tel:${officer.phone}`}>{officer.phone}</a>
            </p>
          ) : null}
          {officer.email ? (
            <p>
              <a href={`mailto:${officer.email}`}>{officer.email}</a>
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function PastOfficerRow({ entry }: { entry: PastOfficer }) {
  return (
    <Row
      status={<span className="small strong cap-muted">{entry.term ?? "Dates not recorded"}</span>}
      title={
        entry.name ? (
          <>
            <span className="strong">{entry.name}</span>
            {entry.institution ? (
              <span className="cap-muted"> &middot; {entry.institution}</span>
            ) : null}
          </>
        ) : (
          <span className="cap-muted">Not recorded</span>
        )
      }
    />
  );
}

// The past-officer role histories, one tab per role (Capsomer's tabs: arrow,
// Home and End keys, activation follows focus). The page does not hydrate, so
// data-cap="tabs" hands the server's markup to Capsomer's tabs behavior (app/site.ts).
function PastOfficersTabs({ tabs }: { tabs: PastOfficerTab[] }) {
  return (
    <Tabs defaultValue={tabs[0]?.id ?? ""} data-cap="tabs">
      <TabsList aria-label="Past branch officers by role">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id}>
          <Panel flush>
            <RowList label={tab.label}>
              {tab.entries.map((entry, entryIndex) => (
                <PastOfficerRow key={`${tab.id}-${entryIndex}`} entry={entry} />
              ))}
            </RowList>
          </Panel>
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default function BranchOfficers({ loaderData }: Route.ComponentProps) {
  const { officers, board, pastTabs } = loaderData;
  return (
    <div className="cap-stack" data-gap="8">
      <header className="cap-stack" data-gap="4">
        <h1 className="page-title">Branch officers</h1>
        <p className="lead">
          The branch is run by elected officers and volunteers from member institutions across
          Texas. They organize the twice-yearly meetings, steward the awards program, and represent
          Texas microbiologists to the national society.
        </p>
      </header>

      <section aria-labelledby="current-officers-heading" className="cap-stack">
        <h2 id="current-officers-heading" className="section-title">
          Current officers
        </h2>
        <ul className="cap-grid" data-cols="2">
          {officers.map((officer) => (
            <li key={`${officer.role}-${officer.name}`}>
              <OfficerCard officer={officer} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="advisory-board-heading" className="cap-stack">
        <h2 id="advisory-board-heading" className="section-title">
          Advisory board
        </h2>
        <ul className="cap-grid" data-cols="2">
          {board.map((member) => (
            <li key={member.name}>
              <article className="cap-card">
                <h3>{member.name}</h3>
                <p className="small cap-muted">{member.institution}</p>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="past-officers-heading" className="cap-stack">
        <div className="cap-stack" data-gap="3">
          <h2 id="past-officers-heading" className="section-title">
            Past branch officers
          </h2>
          <p className="lead">
            A history of those who have led the branch, by role. Choose a role to see its record of
            term, name, and institution.
          </p>
        </div>
        <PastOfficersTabs tabs={pastTabs} />
      </section>
    </div>
  );
}
