import { Link } from "react-router";
import type { Route } from "./+types/awards.$slug";
import { cloudflareContext } from "~/load-context";
import { NotFoundError, getDataAccess } from "~/lib/data-access";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  // The leaf match carries this route's loader data; read the award name from it
  // for the title, falling back when it is not yet available.
  const leaf = matches[matches.length - 1] as
    | { data?: { award?: { name?: string } } }
    | undefined;
  const name = leaf?.data?.award?.name ?? "Award";
  return [{ title: pageTitle(matches, name) }];
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
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm">
          <Link
            to="/awardees"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            All awards
          </Link>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          {award.name}
        </h1>
        {award.description ? (
          <p
            className="max-w-2xl text-text-muted"
            dangerouslySetInnerHTML={{ __html: award.description }}
          />
        ) : null}
        {award.namesakeBio ? (
          <p
            className="max-w-2xl text-sm text-text-muted"
            dangerouslySetInnerHTML={{ __html: award.namesakeBio }}
          />
        ) : null}
      </header>

      {years.length === 0 ? (
        <section
          aria-label="Recipients"
          className="rounded-lg border border-border bg-panel p-6"
        >
          <p className="text-text-muted">
            Recipient records for this award are being compiled and will appear
            here.
          </p>
        </section>
      ) : (
        <div className="space-y-8">
          {years.map((group) => (
            <section
              key={group.year}
              aria-label={`Recipients ${group.year}`}
              className="space-y-4"
            >
              <h2 className="text-xl font-semibold text-text">{group.year}</h2>
              {group.categories.map((bucket, index) => (
                <div
                  key={bucket.category ?? `uncategorized-${index}`}
                  className="space-y-2"
                >
                  {bucket.category ? (
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                      {bucket.category}
                    </h3>
                  ) : null}
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
                    {bucket.recipients.map((recipient) => (
                      <li key={recipient.id} className="px-4 py-3">
                        <p className="text-text">
                          {recipient.placement ? (
                            <span className="mr-2 rounded bg-panel px-1.5 py-0.5 text-xs font-semibold text-text-muted">
                              {recipient.placement}
                            </span>
                          ) : null}
                          <span className="font-medium">
                            {recipient.personName}
                          </span>
                          {recipient.institution ? (
                            <span className="text-text-muted">
                              {" "}
                              &middot; {recipient.institution}
                            </span>
                          ) : null}
                        </p>
                        {recipient.mentor ? (
                          <p className="mt-0.5 text-sm text-text-muted">
                            Mentor: {recipient.mentor}
                          </p>
                        ) : null}
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
