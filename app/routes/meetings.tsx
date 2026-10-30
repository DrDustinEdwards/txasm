import { Form } from "react-router";
import { Link } from "capsomer/react/link";
import { Empty } from "capsomer/react/empty";
import { Field } from "capsomer/react/field";
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
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/meetings",
    name: "Meetings",
    description:
      "Past meetings of the Texas Branch ASM, their programs, and their abstract archives. Search accepted abstracts by author, title, or topic.",
  });
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

function venueLine(venueName: string | null, city: string | null): string {
  return [venueName, city]
    .map((p) => (p ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join(", ");
}

export default function Meetings({ loaderData }: Route.ComponentProps) {
  const { meetings, q, level, format, meeting, results } = loaderData;

  return (
    <div className="stack-8">
      <header className="stack-3">
        <h1 className="page-title">Meetings</h1>
        <p className="lead">
          The branch meets twice a year. Search the accepted abstracts across all
          meetings, or open a meeting for its program and full abstract archive.
        </p>
      </header>

      <Form method="get" role="search" aria-label="Search abstracts" className="card stack-4">
        <Field label="Search abstracts">
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Author, title, or topic" className="cap-input" />
        </Field>
        <div className="grid-3">
          <Field label="Level">
            <select id="level" name="level" defaultValue={level} className="cap-select">
              <option value="">All levels</option>
              {ABSTRACT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {ABSTRACT_LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select id="format" name="format" defaultValue={format} className="cap-select">
              <option value="">All formats</option>
              {ABSTRACT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {ABSTRACT_FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Meeting">
            <select id="meeting" name="meeting" defaultValue={meeting} className="cap-select">
              <option value="">All meetings</option>
              {meetings.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </select>
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
            <p className="cap-muted">No abstracts match that search. Try a broader term.</p>
          ) : (
            <ul className="card-list">
              {results.map((result) => (
                <li key={`${result.editionSlug}-${result.number}`}>
                  <Link to={`/meetings/${result.editionSlug}/abstracts/${result.number}`} className="strong">
                    <span dangerouslySetInnerHTML={{ __html: result.title }} />
                  </Link>
                  <p className="small cap-muted">
                    {[result.presentingAuthorName ?? "", result.editionName, result.topic ?? ""].filter((p) => p.length > 0).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-label="Meetings" className="stack-4">
        <h2 className="subsection-title">All meetings</h2>
        {meetings.length === 0 ? (
          <Empty kind="nothing-yet" title="Meetings appear here once their programs are published." />
        ) : (
          <ul className="stack-4">
            {meetings.map((m) => {
              const venue = venueLine(m.venueName, m.city);
              return (
                <li key={m.slug} className="card stack-1">
                  <h3 className="subsection-title">{m.name}</h3>
                  <p className="small cap-muted">{[`${SEASON_LABELS[m.season]} ${m.year}`, venue].filter((p) => p.length > 0).join(" · ")}</p>
                  <p className="cluster small">
                    <Link to={`/meetings/${m.slug}/abstracts`}>Abstracts ({m.abstractCount})</Link>
                    <Link to={`/meetings/${m.slug}/program`}>Program</Link>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
