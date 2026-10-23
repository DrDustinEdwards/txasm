import { Link } from "react-router";
import type { Route } from "./+types/meetings.$slug.abstracts.$ref";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { joinParts } from "~/lib/format";
import {
  ABSTRACT_FORMAT_LABELS,
  ABSTRACT_LEVEL_LABELS,
  SEASON_LABELS,
} from "~/lib/vocab";
import { pageTitle } from "~/lib/site-meta";
import { Breadcrumb } from "capsomer/react/breadcrumb";
import { renderLink } from "~/components/site-chrome";

export function meta({ params, matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, `Abstract ${params.ref}`) }];
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const number = Number(params.ref);
  const page = await da.publicAbstracts.getOne(params.slug, number);
  if (!page) {
    throw new Response("Abstract not found.", { status: 404 });
  }
  return { edition: page.edition, abstract: page.abstract };
}

export default function AbstractPage({ loaderData }: Route.ComponentProps) {
  const { edition, abstract } = loaderData;
  // Prefer the stored book code (for example UP37); fall back to the 1..n
  // ordinal only when no code is stored.
  const codeLabel = abstract.code ?? String(abstract.number);
  const metaLabel = joinParts([
    abstract.level ? ABSTRACT_LEVEL_LABELS[abstract.level] : null,
    abstract.format ? ABSTRACT_FORMAT_LABELS[abstract.format] : null,
    abstract.topic,
  ]);

  return (
    <div className="reading stack-6">
      <Breadcrumb
        renderLink={renderLink}
        items={[
          { label: "Home", href: "/" },
          { label: "Meetings", href: "/meetings" },
          {
            label: `${edition.name} abstracts`,
            href: `/meetings/${edition.slug}/abstracts`,
          },
          { label: `Abstract ${codeLabel}` },
        ]}
      />

      <header className="stack-3">
        <p className="small cap-muted">
          {`${SEASON_LABELS[edition.season]} ${edition.year}`} · Abstract{" "}
          {codeLabel}
        </p>
        <h1
          className="page-title abstract-title"
          dangerouslySetInnerHTML={{ __html: abstract.title }}
        />
        {abstract.authors.length > 0 ? (
          <p>
            {abstract.authors.map((author, i) => (
              <span key={`${author.name}-${i}`}>
                {author.name}
                {author.affiliationOrdinals.length > 0 ? (
                  <sup>{author.affiliationOrdinals.join(",")}</sup>
                ) : null}
                {author.isPresenting || author.isCorresponding ? (
                  <span className="cap-muted">
                    {" "}
                    (
                    {[
                      author.isPresenting ? "presenting" : "",
                      author.isCorresponding ? "corresponding" : "",
                    ]
                      .filter((p) => p.length > 0)
                      .join(", ")}
                    )
                  </span>
                ) : null}
                {i < abstract.authors.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        ) : null}
        {abstract.affiliations.length > 0 ? (
          <ol className="stack-1 small cap-muted">
            {abstract.affiliations.map((aff) => (
              <li key={aff.ordinal} className="affiliation">
                <sup className="strong">{aff.ordinal}</sup>
                <span>
                  {joinParts([
                    aff.institution,
                    aff.department,
                    aff.city,
                    aff.country,
                  ])}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {metaLabel ? (
          <p className="cap-label">
            {metaLabel}
          </p>
        ) : null}
      </header>

      {abstract.bodyText ? (
        <div
          className="stack-3 abstract-body"
          dangerouslySetInnerHTML={{ __html: abstract.bodyText }}
        />
      ) : (
        <p className="cap-muted">No abstract body on record.</p>
      )}

      <p className="small doc-pager">
        <Link to={`/meetings/${edition.slug}/abstracts`}>
          Back to {edition.name} abstracts
        </Link>
      </p>
    </div>
  );
}
