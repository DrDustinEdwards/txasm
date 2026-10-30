import { Link } from "capsomer/react/link";
import { Empty } from "capsomer/react/empty";
import { Badge } from "capsomer/react/status";
import type { Route } from "./+types/awards.$slug";
import { cloudflareContext } from "~/load-context";
import { NotFoundError, getDataAccess } from "~/lib/data-access";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

export function meta({ matches, location, loaderData }: Route.MetaArgs) {
  const award = loaderData?.award;
  const name = award?.name ?? "Award";
  return pageHead(matches, {
    path: location.pathname,
    name,
    description: award?.description || `The ${name} of the Texas Branch ASM and its recipients.`,
  });
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  try {
    const { award, years } = await da.awards.getBySlug(params.slug);
    return {
      award: {
        name: award.name,
        namesakeBio: award.namesakeBio,
        description: award.description,
      },
      years,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Response("Award not found", { status: 404 });
    }
    throw error;
  }
}

export default function AwardPage({ loaderData }: Route.ComponentProps) {
  const { award, years } = loaderData;

  return (
    <div className="stack-8">
      <header className="stack-3">
        <p className="small">
          <Link to="/awardees">All awards</Link>
        </p>
        <h1 className="page-title">{award.name}</h1>
        {award.description ? <p className="lead" dangerouslySetInnerHTML={{ __html: award.description }} /> : null}
        {award.namesakeBio ? <p className="lead small" dangerouslySetInnerHTML={{ __html: award.namesakeBio }} /> : null}
      </header>

      {years.length === 0 ? (
        <section aria-label="Recipients">
          <Empty kind="nothing-yet" title="Recipient records for this award are being compiled and will appear here." />
        </section>
      ) : (
        <div className="stack-8">
          {years.map((group) => (
            <section key={group.year} aria-label={`Recipients ${group.year}`} className="stack-4">
              <h2 className="section-title">{group.year}</h2>
              {group.categories.map((bucket, index) => (
                <div key={bucket.category ?? `uncategorized-${index}`} className="stack-2">
                  {bucket.category ? <h3 className="cap-label">{bucket.category}</h3> : null}
                  <ul className="card-list">
                    {bucket.recipients.map((recipient) => (
                      <li key={recipient.id}>
                        <p className="cluster recipient">
                          {recipient.placement ? <Badge variant="secondary">{recipient.placement}</Badge> : null}
                          <span>
                            <span className="strong">{recipient.personName}</span>
                            {recipient.institution ? <span className="cap-muted"> &middot; {recipient.institution}</span> : null}
                          </span>
                        </p>
                        {recipient.mentor ? <p className="small cap-muted">Mentor: {recipient.mentor}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
