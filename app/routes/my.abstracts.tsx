import { Link } from "capsomer/react/link";
import type { Route } from "./+types/my.abstracts";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireUser } from "~/lib/auth.server";
import { getActor, getDataAccess } from "~/lib/data-access";
import {
  ABSTRACT_STATUS_LABELS,
  DECISION_OUTCOME_LABELS,
  PRESENTATION_TYPE_LABELS,
  type DecisionOutcome,
  type PresentationType,
} from "~/lib/vocab";

// A signed-in author's page, the way into submission and editing. It hydrates (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "My abstracts");
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user);
  const da = getDataAccess(env);
  const abstracts = await da.abstracts.listMineAll(actor);
  // Read each decision through getForAbstract so the author-visibility rule is
  // enforced in the data layer, not the UI. These are the actor's own abstracts.
  const withDecision = await Promise.all(
    abstracts.map(async (abstract) => ({
      ...abstract,
      decision: await da.decisions.getForAbstract(actor, abstract.id),
    })),
  );
  return { abstracts: withDecision };
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
                      <span dangerouslySetInnerHTML={{ __html: abstract.title }} />
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
