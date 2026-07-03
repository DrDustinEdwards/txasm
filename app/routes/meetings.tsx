import { Form, Link } from "react-router";
import type { Route } from "./+types/meetings";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import {
  ABSTRACT_FORMATS,
  ABSTRACT_FORMAT_LABELS,
  ABSTRACT_LEVELS,
  ABSTRACT_LEVEL_LABELS,
  SEASON_LABELS,
  type AbstractFormat,
  type AbstractLevel,
} from "~/lib/vocab";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Meetings") },
    {
      name: "description",
      content:
        "Past meetings of the Texas Branch ASM, their programs, and their abstract archives. Search accepted abstracts by author, title, or topic.",
    },
  ];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const meetings = await da.editions.listPublic();

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const level = url.searchParams.get("level")?.trim() ?? "";
  const format = url.searchParams.get("format")?.trim() ?? "";
  const meeting = url.searchParams.get("meeting")?.trim() ?? "";

  const hasQuery = Boolean(q || level || format || meeting);
  const results = hasQuery
    ? await da.publicAbstracts.search(q, {
        level: (level || undefined) as AbstractLevel | undefined,
        format: (format || undefined) as AbstractFormat | undefined,
        meeting: meeting || undefined,
      })
    : null;

  return { meetings, q, level, format, meeting, results };
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function venueLine(venueName: string | null, city: string | null): string {
  return [venueName, city]
    .map((p) => (p ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join(", ");
}

export default function Meetings({ loaderData }: Route.ComponentProps) {
  const { meetings, q, level, format, meeting, results } = loaderData;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Meetings
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch meets twice a year. Search the accepted abstracts across all
          meetings, or open a meeting for its program and full abstract archive.
        </p>
      </header>

      <Form
        method="get"
        role="search"
        aria-label="Search abstracts"
        className="space-y-4 rounded-lg border border-border bg-surface-raised p-5"
      >
        <div className="space-y-1">
          <label htmlFor="q" className="block text-sm font-medium text-text">
            Search abstracts
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Author, title, or topic"
            className={inputClass}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="level" className="block text-sm font-medium text-text">
              Level
            </label>
            <select id="level" name="level" defaultValue={level} className={inputClass}>
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
            <select id="format" name="format" defaultValue={format} className={inputClass}>
              <option value="">All formats</option>
              {ABSTRACT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {ABSTRACT_FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="meeting" className="block text-sm font-medium text-text">
              Meeting
            </label>
            <select id="meeting" name="meeting" defaultValue={meeting} className={inputClass}>
              <option value="">All meetings</option>
              {meetings.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </select>
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
              No abstracts match that search. Try a broader term.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
              {results.map((result) => (
                <li
                  key={`${result.editionSlug}-${result.number}`}
                  className="px-4 py-3"
                >
                  <Link
                    to={`/meetings/${result.editionSlug}/abstracts/${result.number}`}
                    className="font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span dangerouslySetInnerHTML={{ __html: result.title }} />
                  </Link>
                  <p className="mt-0.5 text-sm text-text-muted">
                    {[
                      result.presentingAuthorName ?? "",
                      result.editionName,
                      result.topic ?? "",
                    ]
                      .filter((p) => p.length > 0)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-label="Meetings" className="space-y-4">
        <h2 className="text-lg font-medium text-text">All meetings</h2>
        {meetings.length === 0 ? (
          <div className="rounded-lg border border-border bg-panel p-6">
            <p className="text-text-muted">
              Meetings appear here once their programs are published.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {meetings.map((m) => {
              const venue = venueLine(m.venueName, m.city);
              return (
                <li
                  key={m.slug}
                  className="rounded-lg border border-border bg-surface-raised p-5"
                >
                  <h3 className="text-lg font-semibold text-text">{m.name}</h3>
                  <p className="mt-1 text-sm text-text-muted">
                    {[`${SEASON_LABELS[m.season]} ${m.year}`, venue]
                      .filter((p) => p.length > 0)
                      .join(" · ")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <Link
                      to={`/meetings/${m.slug}/abstracts`}
                      className="font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      Abstracts ({m.abstractCount})
                    </Link>
                    <Link
                      to={`/meetings/${m.slug}/program`}
                      className="font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      Program
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
