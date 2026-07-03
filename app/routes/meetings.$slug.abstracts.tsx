import { Form, Link } from "react-router";
import type { Route } from "./+types/meetings.$slug.abstracts";
import { cloudflareContext } from "~/load-context";
import {
  getDataAccess,
  type PublicAbstractSummary,
} from "~/lib/data-access";
import {
  ABSTRACT_FORMATS,
  ABSTRACT_FORMAT_LABELS,
  ABSTRACT_LEVELS,
  ABSTRACT_LEVEL_LABELS,
  SEASON_LABELS,
} from "~/lib/vocab";
import { pageTitle } from "~/lib/site-meta";
import { Breadcrumbs } from "~/components/breadcrumbs";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Abstracts") }];
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

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

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
  return [
    abstract.level ? ABSTRACT_LEVEL_LABELS[abstract.level] : "",
    abstract.format ? ABSTRACT_FORMAT_LABELS[abstract.format] : "",
  ]
    .filter((p) => p.length > 0)
    .join(" · ");
}

export default function MeetingAbstracts({ loaderData }: Route.ComponentProps) {
  const { edition, topics, abstracts, total, untopicedLabel, filters } =
    loaderData;
  const groups = groupByTopic(abstracts);
  const filtered = filters.level || filters.format || filters.topic;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Breadcrumbs
        trail={[
          { label: "Home", to: "/" },
          { label: "Meetings", to: "/meetings" },
          { label: `${edition.name} abstracts` },
        ]}
      />

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          {edition.name}
        </h1>
        <p className="text-lg text-text-muted">Abstracts</p>
        <p className="text-sm text-text-muted">
          {`${SEASON_LABELS[edition.season]} ${edition.year}`} ·{" "}
          <Link
            to={`/meetings/${edition.slug}/program`}
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Program
          </Link>
        </p>
      </header>

      <Form
        method="get"
        aria-label="Filter abstracts"
        className="grid gap-3 rounded-lg border border-border bg-surface-raised p-5 sm:grid-cols-4 sm:items-end"
      >
        <div className="space-y-1">
          <label htmlFor="level" className="block text-sm font-medium text-text">
            Level
          </label>
          <select id="level" name="level" defaultValue={filters.level} className={inputClass}>
            <option value="">All levels</option>
            {ABSTRACT_LEVELS.map((l) => (
              <option key={l} value={l}>
                {ABSTRACT_LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="format" className="block text-sm font-medium text-text">
            Format
          </label>
          <select id="format" name="format" defaultValue={filters.format} className={inputClass}>
            <option value="">All formats</option>
            {ABSTRACT_FORMATS.map((f) => (
              <option key={f} value={f}>
                {ABSTRACT_FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="topic" className="block text-sm font-medium text-text">
            Topic
          </label>
          <select id="topic" name="topic" defaultValue={filters.topic} className={inputClass}>
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value={NO_TOPIC}>{untopicedLabel}</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Apply
          </button>
          {filtered ? (
            <Link
              to={`/meetings/${edition.slug}/abstracts`}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </Form>

      <p className="text-sm text-text-muted" aria-live="polite">
        {filtered
          ? `${abstracts.length} of ${total} abstracts`
          : `${total} abstracts`}
      </p>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-border bg-panel p-6 text-text-muted">
          No abstracts match these filters.
        </p>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => {
            const label = group.topic ?? untopicedLabel;
            return (
              <section
                key={group.topic ?? NO_TOPIC}
                aria-label={label}
                className="space-y-4"
              >
                <h2 className="border-b border-border pb-2 text-xl font-semibold text-text">
                  {label}
                </h2>
              <ul className="space-y-4">
                {group.abstracts.map((abstract) => {
                  const line = metaLine(abstract);
                  return (
                    <li
                      key={abstract.number}
                      className="rounded-lg border border-border bg-surface-raised p-4"
                    >
                      <div className="flex gap-3">
                        <span className="shrink-0 text-sm font-semibold text-text-muted">
                          {abstract.number}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <Link
                            to={`/meetings/${edition.slug}/abstracts/${abstract.number}`}
                            className="font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                          >
                            <span
                              dangerouslySetInnerHTML={{ __html: abstract.title }}
                            />
                          </Link>
                          {abstract.authors.length > 0 ? (
                            <p className="text-sm text-text-muted">
                              {abstract.authors.map((a) => a.name).join(", ")}
                            </p>
                          ) : null}
                          {line ? (
                            <p className="text-xs uppercase tracking-wide text-text-muted">
                              {line}
                            </p>
                          ) : null}
                        </div>
                      </div>
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
