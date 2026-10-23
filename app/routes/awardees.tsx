import { Form, Link } from "react-router";
import { Empty } from "capsomer/react/empty";
import { Field } from "capsomer/react/field";
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

export default function Awardees({ loaderData }: Route.ComponentProps) {
  const { awards, q, award, year, institution, results } = loaderData;

  return (
    <div className="stack-8">
      <header className="stack-3">
        <h1 className="page-title">Awardees</h1>
        <p className="lead">
          The branch recognizes outstanding student, faculty, and service work
          with named awards presented at its meetings. Search across every award,
          or choose an award to see its recipients by year.
        </p>
      </header>

      <Form method="get" role="search" aria-label="Search awardees" className="card stack-4">
        <Field label="Search term">
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Name, institution, or mentor" className="cap-input" />
        </Field>
        <div className="grid-3">
          <Field label="Award">
            <select id="award" name="award" defaultValue={award} className="cap-select">
              <option value="">All awards</option>
              {awards.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <input id="year" name="year" type="text" defaultValue={year} placeholder="2025-26" className="cap-input" />
          </Field>
          <Field label="Institution">
            <input id="institution" name="institution" type="text" defaultValue={institution} className="cap-input" />
          </Field>
        </div>
        <button type="submit" className="cap-btn" data-variant="primary">
          Search
        </button>
      </Form>

      {results ? (
        <section aria-label="Search results" className="stack-4">
          <h2 className="subsection-title">
            {results.length} {results.length === 1 ? "result" : "results"}
          </h2>
          {results.length === 0 ? (
            <p className="cap-muted">No awardees match that search. Try a broader term.</p>
          ) : (
            <ul className="card-list">
              {results.map((result) => (
                <li key={result.id}>
                  <p>
                    <span className="strong">{result.personName}</span>
                    {result.institution ? <span className="cap-muted"> &middot; {result.institution}</span> : null}
                  </p>
                  <p className="small cap-muted">
                    <Link to={`/awards/${result.awardSlug}`}>{result.awardName}</Link>
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

      <section aria-label="Awards" className="stack-4">
        <h2 className="subsection-title">All awards</h2>
        {awards.length === 0 ? (
          <Empty kind="nothing-yet" title="The awards archive is being compiled and will appear here." />
        ) : (
          <ul className="grid-2">
            {awards.map((a) => (
              <li key={a.slug}>
                <Link to={`/awards/${a.slug}`} className="card card-link">
                  <h3 className="subsection-title">{a.name}</h3>
                  {a.description ? <p className="small cap-muted" dangerouslySetInnerHTML={{ __html: a.description }} /> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
