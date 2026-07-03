import { Form, Link } from "react-router";
import type { Route } from "./+types/awards.search";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Search awardees") },
    {
      name: "description",
      content:
        "Search Texas Branch ASM award recipients by person, institution, mentor, year, or award.",
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
  const awardList = await da.awards.listAll();
  const awards = awardList.map((a) => ({ slug: a.slug, name: a.name }));

  // Only search once the visitor has entered a term or a filter, so the first
  // view is the empty form rather than the whole archive.
  const hasQuery = Boolean(q || award || year || institution);
  const results = hasQuery
    ? await da.awardRecipients.search(q, {
        awardSlug: award || undefined,
        year: year || undefined,
        institution: institution || undefined,
      })
    : null;

  return { q, award, year, institution, awards, results };
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default function AwardsSearch({ loaderData }: Route.ComponentProps) {
  const { q, award, year, institution, awards, results } = loaderData;

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
          Search awardees
        </h1>
        <p className="max-w-2xl text-text-muted">
          Search across every award by person, institution, mentor, or year.
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
            {results.length}{" "}
            {results.length === 1 ? "result" : "results"}
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
    </div>
  );
}
