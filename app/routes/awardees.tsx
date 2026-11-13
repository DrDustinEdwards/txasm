import { Form } from "react-router";
import { Row, RowList } from "capsomer/react/row-list";
import { Panel } from "capsomer/react/panel";
import { Link } from "capsomer/react/link";
import { Empty } from "capsomer/react/empty";
import { Field } from "capsomer/react/field";
import { FilterBar } from "capsomer/react/filter-bar";
import type { Route } from "./+types/awardees";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { getDataAccess } from "~/lib/data-access";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import { RichText } from "capsomer/react/trusted-html";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/awardees",
    pageType: "CollectionPage",
    name: "Awardees",
    description:
      "The named awards of the Texas Branch ASM and their recipients. Search by person, institution, mentor, year, or award.",
  });
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
    <div className="cap-stack" data-gap="7">
      <header className="cap-stack" data-gap="4">
        <h1 className="page-title">Awardees</h1>
        <p className="lead">
          The branch recognizes outstanding student, faculty, and service work with named awards
          presented at its meetings. Search across every award, or choose an award to see its
          recipients by year.
        </p>
      </header>

      <Panel>
        <FilterBar label="Search awardees" Form={Form} applyLabel="Search">
          <Field label="Search term">
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Name, institution, or mentor"
              className="cap-input"
            />
          </Field>
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
            <input
              id="year"
              name="year"
              type="text"
              defaultValue={year}
              placeholder="2025-26"
              className="cap-input"
            />
          </Field>
          <Field label="Institution">
            <input
              id="institution"
              name="institution"
              type="text"
              defaultValue={institution}
              className="cap-input"
            />
          </Field>
        </FilterBar>
      </Panel>

      {results ? (
        <section aria-label="Search results" className="cap-stack">
          <h2 className="subsection-title">
            {results.length} {results.length === 1 ? "result" : "results"}
          </h2>
          {results.length === 0 ? (
            <p className="cap-muted">No awardees match that search. Try a broader term.</p>
          ) : (
            <Panel flush>
              <RowList label="Search results">
                {results.map((result) => (
                  <Row
                    key={result.id}
                    title={
                      <>
                        <span className="strong">{result.personName}</span>
                        {result.institution ? (
                          <span className="cap-muted"> &middot; {result.institution}</span>
                        ) : null}
                      </>
                    }
                    detail={
                      <>
                        <Link to={`/awards/${result.awardSlug}`}>{result.awardName}</Link>
                        {" · "}
                        {result.year}
                        {result.placement ? ` · ${result.placement}` : ""}
                        {result.mentor ? ` · Mentor: ${result.mentor}` : ""}
                      </>
                    }
                  />
                ))}
              </RowList>
            </Panel>
          )}
        </section>
      ) : null}

      <section aria-label="Awards" className="cap-stack">
        <h2 className="subsection-title">All awards</h2>
        {awards.length === 0 ? (
          <Empty
            kind="nothing-yet"
            title="The awards archive is being compiled and will appear here."
          />
        ) : (
          <ul className="cap-card-grid">
            {awards.map((a) => (
              <li key={a.slug}>
                <Link to={`/awards/${a.slug}`}>
                  <article className="cap-card">
                    <h3>{a.name}</h3>
                    <RichText as="p" className="small cap-muted" html={a.description} />
                  </article>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
