import { Link } from "capsomer/react/link";
import type { Route } from "./+types/my.abstracts";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireUser } from "~/lib/auth.server";
import { getActor, getDataAccess } from "~/lib/data-access";
import {
  ABSTRACT_STATUS_LABELS,
  DECISION_OUTCOME_LABELS,
  PRESENTATION_TYPE_LABELS,
  type DecisionOutcome,
  type PresentationType,
} from "~/lib/vocab";
import { markup } from "capsomer/behavior/trusted-html";

// A signed-in author's page, the way into submission and editing. It hydrates (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "My abstracts"));
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user);
  const da = getDataAccess(env);
  // Two queries for any number of abstracts; the data layer limits both to the actor's own.
  const [abstracts, decisions] = await Promise.all([
    da.abstracts.listMineAll(actor),
    da.decisions.listForMine(actor),
  ]);
  return {
    abstracts: abstracts.map((abstract) => ({
      ...abstract,
      decision: decisions.get(abstract.id) ?? null,
    })),
  };
}

export default function MyAbstracts({ loaderData }: Route.ComponentProps) {
  const { abstracts } = loaderData;

  return (
    <div className="stack-6">
      <h1 className="page-title">My abstracts</h1>

      {abstracts.length === 0 ? (
        <p>
          You have not started any abstracts yet. Open the submission page for a meeting to begin.
        </p>
      ) : (
        <div className="cap-table-wrap" role="region" aria-label="Your abstracts" tabIndex={0}>
          <table className="cap-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Meeting</th>
                <th scope="col">Status</th>
                <th scope="col">Decision</th>
                <th scope="col" className="cell-end">
                  <span className="cap-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {abstracts.map((abstract) => (
                <tr key={abstract.id}>
                  <td>
                    {abstract.title ? (
                      <span dangerouslySetInnerHTML={markup(abstract.title)} />
                    ) : (
                      <span className="cap-muted">Untitled</span>
                    )}
                  </td>
                  <td>{abstract.editionName}</td>
                  <td>{ABSTRACT_STATUS_LABELS[abstract.status]}</td>
                  <td>
                    {abstract.decision ? (
                      <span>
                        {DECISION_OUTCOME_LABELS[abstract.decision.outcome as DecisionOutcome] ??
                          abstract.decision.outcome}
                        {abstract.decision.presentationType
                          ? ` (${
                              PRESENTATION_TYPE_LABELS[
                                abstract.decision.presentationType as PresentationType
                              ] ?? abstract.decision.presentationType
                            })`
                          : ""}
                      </span>
                    ) : (
                      <span className="cap-muted">Pending</span>
                    )}
                  </td>
                  <td className="cell-end">
                    <Link to={`/abstracts/${abstract.id}/edit`} className="strong">
                      {abstract.status === "draft" ? "Edit" : "View or edit"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
