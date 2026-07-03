import { Link } from "react-router";
import type { Route } from "./+types/awardees";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Awardees") },
    {
      name: "description",
      content:
        "The named awards of the Texas Branch ASM and their recipients, by year.",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const list = await da.awards.listAll();
  const awards = list.map((a) => ({
    slug: a.slug,
    name: a.name,
    description: a.description,
  }));
  return { awards };
}

export default function Awardees({ loaderData }: Route.ComponentProps) {
  const { awards } = loaderData;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Awardees
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch recognizes outstanding student, faculty, and service work
          with named awards presented at its meetings. Choose an award to see its
          recipients by year, or search across every award.
        </p>
        <p className="text-sm">
          <Link
            to="/awards/search"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Search awardees
          </Link>
        </p>
      </header>

      {awards.length === 0 ? (
        <section
          aria-label="Awards"
          className="rounded-lg border border-border bg-panel p-6"
        >
          <p className="text-text-muted">
            The awards archive is being compiled and will appear here.
          </p>
        </section>
      ) : (
        <section aria-label="Awards">
          <ul className="grid gap-4 sm:grid-cols-2">
            {awards.map((award) => (
              <li key={award.slug}>
                <Link
                  to={`/awards/${award.slug}`}
                  className="block h-full rounded-lg border border-border bg-surface-raised p-5 hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <h2 className="text-lg font-semibold text-link">
                    {award.name}
                  </h2>
                  {award.description ? (
                    <p
                      className="mt-2 text-sm text-text-muted"
                      dangerouslySetInnerHTML={{ __html: award.description }}
                    />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
