import { Form, Link } from "react-router";
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
        "The named awards of the Texas Branch ASM and their recipients. Search by person, institution, mentor, year, or award.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const award = url.searchParams.get("award")?.trim() ?? "";
  const year = url.searchParams.get("year")?.trim() ?? "";
  const institution = url.searchParams.get("institution")?.trim() ?? "";

  const da = getDataAccess(context.get(cloudflareContext).env);
  const list = await da.awards.listAll();
  const awards = list.map((a) => ({
    slug: a.slug,
    name: a.name,
    description: a.description,
  }));

  // Search runs only once a term or filter is present, so the default view is
  // the awards index rather than the whole archive. Same parameterized
  // data-access call the /api/awards-search JSON endpoint uses.
  const hasQuery = Boolean(q || award || year || institution);
  const results = hasQuery
    ? await da.awardRecipients.search(q, {
        awardSlug: award || undefined,
        year: year || undefined,
        institution: institution || undefined,
      })
    : null;

  return { awards, q, award, year, institution, results };
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default function Awardees({ loaderData }: Route.ComponentProps) {
  const { awards, q, award, year, institution, results } = loaderData;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Awardees
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch recognizes outstanding student, faculty, and service work
          with named awards presented at its meetings. Search across every award,
          or choose an award to see its recipients by year.
        </p>
      </header>

      <Form
        method="get"
        role="search"
        aria-label="Search awardees"
        className="space-y-4 rounded-lg border border-border bg-surface-raised p-5"
      >
        <div className="space-y-1">
          <label htmlFor="q" className="block text-sm font-medium text-text">
            Search term
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, institution, or mentor"
            className={inputClass}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="award" className="block text-sm font-medium text-text">
              Award
            </label>
            <select id="award" name="award" defaultValue={award} className={inputClass}>
              <option value="">All awards</option>
              {awards.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="year" className="block text-sm font-medium text-text">
              Year
            </label>
            <input
              id="year"
              name="year"
              type="text"
              defaultValue={year}
              placeholder="2025-26"
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="institution"
              className="block text-sm font-medium text-text"
            >
              Institution
            </label>
            <input
              id="institution"
              name="institution"
              type="text"
              defaultValue={institution}
              className={inputClass}
            />
          </div>
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Search
        </button>
      </Form>

      {results ? (
        <section aria-label="Search results" className="space-y-4">
          <h2 className="text-lg font-medium text-text">
            {results.length} {results.length === 1 ? "result" : "results"}
          </h2>
          {results.length === 0 ? (
            <p className="text-text-muted">
              No awardees match that search. Try a broader term.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
              {results.map((result) => (
                <li key={result.id} className="px-4 py-3">
                  <p className="text-text">
                    <span className="font-medium">{result.personName}</span>
                    {result.institution ? (
                      <span className="text-text-muted">
                        {" "}
                        &middot; {result.institution}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-text-muted">
                    <Link
                      to={`/awards/${result.awardSlug}`}
                      className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {result.awardName}
                    </Link>
                    {" · "}
                    {result.year}
                    {result.placement ? ` · ${result.placement}` : ""}
                    {result.mentor ? ` · Mentor: ${result.mentor}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-label="Awards" className="space-y-4">
        <h2 className="text-lg font-medium text-text">All awards</h2>
        {awards.length === 0 ? (
          <div className="rounded-lg border border-border bg-panel p-6">
            <p className="text-text-muted">
              The awards archive is being compiled and will appear here.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {awards.map((a) => (
              <li key={a.slug}>
                <Link
                  to={`/awards/${a.slug}`}
                  className="block h-full rounded-lg border border-border bg-surface-raised p-5 hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <h3 className="text-lg font-semibold text-link">{a.name}</h3>
                  {a.description ? (
                    <p
                      className="mt-2 text-sm text-text-muted"
                      dangerouslySetInnerHTML={{ __html: a.description }}
                    />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
