import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.review.$abstractId";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireChair } from "~/lib/auth.server";
import { NotFoundError, getDataAccess } from "~/lib/data-access";
import { DATE_TIME } from "~/lib/format";
import { formatDate } from "capsomer/behavior/time";
import { RichText } from "capsomer/react/trusted-html";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Reviews"));
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
    <div className="form-page stack-6">
      <div className="stack-2">
        <h1 className="page-title">
          Reviews for <RichText as="span" html={abstract.title} fallback="an untitled abstract" />
        </h1>
        <p>
          <Link to={`/admin/editions/${editionId}/review`} className="strong">
            Back to assignments
          </Link>
        </p>
      </div>

      {reviews.length === 0 ? (
        <p>No reviews submitted yet.</p>
      ) : (
        <ul className="stack-4">
          {reviews.map((review) => (
            <li key={review.id} className="card stack-3">
              <div className="spread">
                <span className="small strong">{review.reviewerName || review.reviewerEmail}</span>
                <span className="small cap-muted">
                  {review.submittedAt ? formatDate(review.submittedAt, DATE_TIME) : null}
                </span>
              </div>
              <p className="small">
                <span className="strong">Recommendation:</span>{" "}
                {recommendationLabel(review.recommendation)}
              </p>
              {review.overallComment ? (
                <div className="stack-1">
                  <h2 className="small strong">Overall comment</h2>
                  <RichText className="small" html={review.overallComment} />
                </div>
              ) : null}
              {review.confidentialComment ? (
                <div className="cap-banner stack-1" data-tone="warn">
                  <h2 className="small strong">Confidential comment to chairs</h2>
                  <RichText className="small" html={review.confidentialComment} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
