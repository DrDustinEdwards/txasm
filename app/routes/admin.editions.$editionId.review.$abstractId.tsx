import { Link } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.review.$abstractId";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import { NotFoundError, getDataAccess } from "~/lib/data-access";
import { formatDateTime } from "~/lib/format";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Reviews | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);

  let abstract;
  try {
    abstract = await da.abstracts.get(actor, params.abstractId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    throw error;
  }

  const reviews = await da.reviews.listForAbstract(actor, params.abstractId);
  return {
    editionId: params.editionId,
    abstract: { id: abstract.id, title: abstract.title },
    reviews,
  };
}

function recommendationLabel(value: string | null) {
  if (value === "accept") return "Accept";
  if (value === "reject") return "Reject";
  if (value === "revise") return "Revise";
  return "No recommendation";
}

export default function AbstractReviews({ loaderData }: Route.ComponentProps) {
  const { editionId, abstract, reviews } = loaderData;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">
          Reviews for{" "}
          {abstract.title ? (
            <span dangerouslySetInnerHTML={{ __html: abstract.title }} />
          ) : (
            "an untitled abstract"
          )}
        </h1>
        <p className="text-gray-700 dark:text-gray-300">
          <Link
            to={`/admin/editions/${editionId}/review`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Back to assignments
          </Link>
        </p>
      </div>

      {reviews.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          No reviews submitted yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {review.reviewerName || review.reviewerEmail}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {review.submittedAt
                    ? formatDateTime(review.submittedAt)
                    : null}
                </span>
              </div>
              <p className="text-sm">
                <span className="font-medium">Recommendation:</span>{" "}
                {recommendationLabel(review.recommendation)}
              </p>
              {review.overallComment ? (
                <div className="space-y-1">
                  <h2 className="text-sm font-medium">Overall comment</h2>
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{ __html: review.overallComment }}
                  />
                </div>
              ) : null}
              {review.confidentialComment ? (
                <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                  <h2 className="text-sm font-medium">
                    Confidential comment to chairs
                  </h2>
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{
                      __html: review.confidentialComment,
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
