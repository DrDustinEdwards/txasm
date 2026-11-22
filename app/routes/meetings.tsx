import { Stack } from "capsomer/react/stack";
import "capsomer/row-list.css";
import { Text, Title } from "capsomer/react/text";
import { Form } from "react-router";
import { routerRenderLink } from "capsomer/react/link";
import { Row, RowList } from "capsomer/react/row-list";
import { Panel } from "capsomer/react/panel";
import { Link } from "capsomer/react/link";
import { Empty } from "capsomer/react/empty";
import { Field } from "capsomer/react/field";
import { LevelFormatFields } from "~/components/level-format-fields";
import type { Route } from "./+types/meetings";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { getDataAccess } from "~/lib/data-access";
import { SEASON_LABELS, type AbstractFormat, type AbstractLevel } from "~/lib/vocab";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import { RichText } from "capsomer/react/trusted-html";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/meetings",
    pageType: "CollectionPage",
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
    <Stack gap={7}>
      <Stack as="header" gap={4}>
        <Title as="h1" size={2}>
          Meetings
        </Title>
      </Stack>

      <Panel>
        <Stack as={Form} method="get" role="search" aria-label="Search abstracts">
          <Field label="Search abstracts">
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Author, title, or topic"
              className="cap-input"
            />
          </Field>
          <div className="cap-grid">
            <LevelFormatFields level={level} format={format} />
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
        </Stack>
      </Panel>

      {results ? (
        <Stack as="section" aria-label="Search results">
          <Title size={5}>
            {results.length} {results.length === 1 ? "result" : "results"}
          </Title>
          {results.length === 0 ? (
            <p className="cap-muted">No abstracts match.</p>
          ) : (
            <Panel flush>
              <RowList label="Search results">
                {results.map((result) => (
                  <Row
                    key={`${result.editionSlug}-${result.number}`}
                    href={`/meetings/${result.editionSlug}/abstracts/${result.number}`}
                    renderLink={routerRenderLink}
                    title={<RichText as="span" html={result.title} />}
                    detail={[
                      result.presentingAuthorName ?? "",
                      result.editionName,
                      result.topic ?? "",
                    ]
                      .filter((p) => p.length > 0)
                      .join(" · ")}
                  />
                ))}
              </RowList>
            </Panel>
          )}
        </Stack>
      ) : null}

      <Stack as="section" aria-label="Meetings">
        {meetings.length === 0 ? (
          <Empty kind="nothing-yet" title="No meetings yet." />
        ) : (
          <Stack as="ul">
            {meetings.map((m) => {
              const venue = venueLine(m.venueName, m.city);
              return (
                <li key={m.slug}>
                  <article className="cap-card">
                    <h2>{m.name}</h2>
                    <Text size="small" tone="muted">
                      {[`${SEASON_LABELS[m.season]} ${m.year}`, venue]
                        .filter((p) => p.length > 0)
                        .join(" · ")}
                    </Text>
                    <Text as="footer" size="small" className="cap-cluster">
                      <Link to={`/meetings/${m.slug}/abstracts`}>
                        Abstracts ({m.abstractCount})
                      </Link>
                      <Link to={`/meetings/${m.slug}/program`}>Program</Link>
                    </Text>
                  </article>
                </li>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
