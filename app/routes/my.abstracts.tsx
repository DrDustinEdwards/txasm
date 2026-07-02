import { Link } from "react-router";
import type { Route } from "./+types/my.abstracts";
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

export function meta(_args: Route.MetaArgs) {
  return [{ title: "My abstracts | Texas Branch ASM" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user.id);
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
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">My abstracts</h1>

      {abstracts.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          You have not started any abstracts yet. Open the submission page for a
          meeting to begin.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th scope="col" className="py-2 pr-4 font-medium">
                Title
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Meeting
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Status
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Decision
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {abstracts.map((abstract) => (
              <tr
                key={abstract.id}
                className="border-b border-gray-100 dark:border-gray-900"
              >
                <td className="py-2 pr-4">
                  {abstract.title ? (
                    <span
                      dangerouslySetInnerHTML={{ __html: abstract.title }}
                    />
                  ) : (
                    <span className="text-gray-500">Untitled</span>
                  )}
                </td>
                <td className="py-2 pr-4">{abstract.editionName}</td>
                <td className="py-2 pr-4">
                  {ABSTRACT_STATUS_LABELS[abstract.status]}
                </td>
                <td className="py-2 pr-4">
                  {abstract.decision ? (
                    <span>
                      {DECISION_OUTCOME_LABELS[
                        abstract.decision.outcome as DecisionOutcome
                      ] ?? abstract.decision.outcome}
                      {abstract.decision.presentationType
                        ? ` (${
                            PRESENTATION_TYPE_LABELS[
                              abstract.decision.presentationType as PresentationType
                            ] ?? abstract.decision.presentationType
                          })`
                        : ""}
                    </span>
                  ) : (
                    <span className="text-gray-500">Pending</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <Link
                    to={`/abstracts/${abstract.id}/edit`}
                    className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {abstract.status === "draft" ? "Edit" : "View or edit"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
