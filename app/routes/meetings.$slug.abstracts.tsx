import "capsomer/filter-bar.css";
import { Form } from "react-router";
import { Panel } from "capsomer/react/panel";
import { Link, routerRenderLink } from "capsomer/react/link";
import { Empty } from "capsomer/react/empty";
import { Field } from "capsomer/react/field";
import { FilterBar } from "capsomer/react/filter-bar";
import { countText } from "capsomer/content";
import type { Route } from "./+types/meetings.$slug.abstracts";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { getDataAccess, type PublicAbstractSummary } from "~/lib/data-access";
import {
  ABSTRACT_FORMATS,
  ABSTRACT_FORMAT_LABELS,
  ABSTRACT_LEVELS,
  ABSTRACT_LEVEL_LABELS,
  SEASON_LABELS,
} from "~/lib/vocab";
import { pageHead } from "~/lib/site-meta";
import { Breadcrumb } from "capsomer/react/breadcrumb";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import { RichText } from "capsomer/react/trusted-html";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

export function meta({ matches, location, loaderData }: Route.MetaArgs) {
  const edition = loaderData?.edition;
  return pageHead(matches, {
    path: location.pathname,
    pageType: "CollectionPage",
    name: edition ? `${edition.name} abstracts` : "Abstracts",
    description: edition
      ? `Accepted abstracts from the ${edition.name} of the Texas Branch ASM, by topic, level and format.`
      : "Accepted abstracts from a Texas Branch ASM meeting.",
  });
}

// Sentinel for the untopiced (oral) group in the topic filter.
const NO_TOPIC = "none";

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const listing = await da.publicAbstracts.listForEdition(params.slug);
  if (!listing) {
    throw new Response("Meeting abstracts not found.", { status: 404 });
  }

  const url = new URL(request.url);
  const level = url.searchParams.get("level")?.trim() ?? "";
  const format = url.searchParams.get("format")?.trim() ?? "";
  const topic = url.searchParams.get("topic")?.trim() ?? "";

  let abstracts = listing.abstracts;
  if (level) abstracts = abstracts.filter((a) => a.level === level);
  if (format) abstracts = abstracts.filter((a) => a.format === format);
  if (topic === NO_TOPIC) {
    abstracts = abstracts.filter((a) => a.topic === null);
  } else if (topic) {
    abstracts = abstracts.filter((a) => a.topic === topic);
  }

  // Label the untopiced group from the full set: the oral presentations when
  // every untopiced abstract is oral, otherwise a neutral label so a stray
  // untopiced poster is not mislabeled. Used for both the filter and the heading.
  const untopiced = listing.abstracts.filter((a) => a.topic === null);
  const untopicedLabel =
    untopiced.length > 0 && untopiced.every((a) => a.format === "oral")
      ? "Oral presentations"
      : "Other presentations";

  return {
    edition: listing.edition,
    topics: listing.topics,
    abstracts,
    total: listing.abstracts.length,
    untopicedLabel,
    filters: { level, format, topic },
  };
}

type Group = { topic: string | null; abstracts: PublicAbstractSummary[] };

function groupByTopic(abstracts: PublicAbstractSummary[]): Group[] {
  const groups: Group[] = [];
  const index = new Map<string, Group>();
  for (const a of abstracts) {
    const key = a.topic ?? NO_TOPIC;
    let group = index.get(key);
    if (!group) {
      group = { topic: a.topic, abstracts: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.abstracts.push(a);
  }
  return groups;
}

function metaLine(abstract: PublicAbstractSummary): string {
  // Fall back to the raw stored value when a level or format has no label, so an
  // unrecognized value degrades to plain text instead of an undefined that throws
  // on .length. Empty when the axis is unset.
  return [
    abstract.level ? (ABSTRACT_LEVEL_LABELS[abstract.level] ?? abstract.level) : "",
    abstract.format ? (ABSTRACT_FORMAT_LABELS[abstract.format] ?? abstract.format) : "",
  ]
    .filter((p) => p.length > 0)
    .join(" · ");
}

export default function MeetingAbstracts({ loaderData }: Route.ComponentProps) {
  const { edition, topics, abstracts, total, untopicedLabel, filters } = loaderData;
  const groups = groupByTopic(abstracts);
  const filtered = filters.level || filters.format || filters.topic;

  return (
    <div className="cap-stack" data-gap="7">
      <Breadcrumb
        renderLink={routerRenderLink}
        items={[
          { label: "Home", href: "/" },
          { label: "Meetings", href: "/meetings" },
          { label: `${edition.name} abstracts` },
        ]}
      />

      <header className="cap-stack" data-gap="3">
        <h1 className="cap-title" data-size="2">
          {edition.name}
        </h1>
        <p className="cap-text" data-size="lead" data-tone="ink">
          Abstracts
        </p>
        <p className="cap-text cap-muted" data-size="small">
          {`${SEASON_LABELS[edition.season]} ${edition.year}`} ·{" "}
          <Link to={`/meetings/${edition.slug}/program`}>Program</Link>
        </p>
      </header>

      <Panel>
        <FilterBar
          label="Filter abstracts"
          Form={Form}
          applyVariant="primary"
          clearLabel="Clear"
          clearHref={filtered ? `/meetings/${edition.slug}/abstracts` : null}
          renderLink={routerRenderLink}
          count={countText(abstracts.length, total, { noun: "abstract", plural: "abstracts" })}
        >
          <Field label="Level">
            <select id="level" name="level" defaultValue={filters.level} className="cap-select">
              <option value="">All levels</option>
              {ABSTRACT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {ABSTRACT_LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select id="format" name="format" defaultValue={filters.format} className="cap-select">
              <option value="">All formats</option>
              {ABSTRACT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {ABSTRACT_FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Topic">
            <select id="topic" name="topic" defaultValue={filters.topic} className="cap-select">
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value={NO_TOPIC}>{untopicedLabel}</option>
            </select>
          </Field>
        </FilterBar>
      </Panel>

      {groups.length === 0 ? (
        <Empty kind="no-match" title="No abstracts match these filters." />
      ) : (
        <div className="cap-stack" data-gap="8">
          {groups.map((group) => {
            const label = group.topic ?? untopicedLabel;
            return (
              <section key={group.topic ?? NO_TOPIC} aria-label={label} className="cap-stack">
                <h2 className="cap-title rule-below" data-size="4">
                  {label}
                </h2>
                <ul className="cap-stack">
                  {group.abstracts.map((abstract) => {
                    const line = metaLine(abstract);
                    return (
                      <li key={abstract.number}>
                        <article className="cap-card">
                          <header>
                            <p
                              className="cap-text cap-muted"
                              data-size="small"
                              data-weight="strong"
                            >
                              {abstract.code ?? abstract.number}
                            </p>
                            <h3>
                              <Link
                                to={`/meetings/${edition.slug}/abstracts/${abstract.number}`}
                                className="cap-card-link"
                              >
                                <RichText as="span" html={abstract.title} />
                              </Link>
                            </h3>
                          </header>
                          <div className="cap-stack" data-gap="2">
                            {abstract.authors.length > 0 ? (
                              <p className="cap-text cap-muted" data-size="small">
                                {abstract.authors.map((a) => a.name).join(", ")}
                              </p>
                            ) : null}
                            {line ? <p className="cap-label">{line}</p> : null}
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
