import "capsomer/breadcrumb.css";
import { Title, Text } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import { routerRenderLink } from "capsomer/react/link";
import type { Route } from "./+types/meetings.$slug.program";
import { jsonLd } from "@drdustinedwards/site-helpers/schema";
import { meetingLd, pageHead } from "~/lib/site-meta";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import {
  NotFoundError,
  getDataAccess,
  type ProgramSessionResolved,
  type SpeakerPublic,
  type SponsorPublic,
} from "~/lib/data-access";
import { DATE_TIME, joinParts } from "~/lib/format";
import { dateRange, formatDate } from "capsomer/behavior/time";
import { programKindLabel, speakerRoleLabel } from "~/lib/vocab";
import { Breadcrumb } from "capsomer/react/breadcrumb";
import { Empty } from "capsomer/react/empty";
import { Pill } from "capsomer/react/status";
import { Schedule, ScheduleDayNav, ScheduleSession } from "capsomer/react/schedule";
import { RichText } from "capsomer/react/trusted-html";
import { ProgramItemTitle } from "~/components/program-item-title";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import schedule from "capsomer/schedule.css?url";
import { isHttpUrl } from "@dustinedwards/site-runtime/url";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
// Capsomer stylesheets only this page uses, so no other page downloads them (devkit-route-weight counts them).
export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: schedule }];

export const headers = () => publicPageHeaders();

export function meta({ matches, location, loaderData }: Route.MetaArgs) {
  const edition = loaderData?.edition;
  const name = edition ? `${edition.name} program` : "Program";
  return [
    ...pageHead(matches, {
      path: location.pathname,
      pageType: "CollectionPage",
      name,
      description: edition
        ? `The program of the ${edition.name} of the Texas Branch ASM${edition.city ? `, ${edition.city}` : ""}.`
        : "A Texas Branch ASM meeting program.",
    }),
    ...(edition ? [jsonLd(meetingLd(edition, location.pathname))] : []),
  ];
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);

  let edition;
  try {
    edition = await da.editions.get(params.slug);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    throw error;
  }

  const program = await da.programSessions.getPublicProgram(edition.id);
  return {
    edition: {
      name: edition.name,
      meetingStartsAt: edition.meetingStartsAt,
      meetingEndsAt: edition.meetingEndsAt,
      venueName: edition.venueName,
      city: edition.city,
      // A past meeting's program says each day with its year.
      past: edition.status === "complete" || edition.status === "archived",
    },
    program,
  };
}

function ProgramItemView({ item }: { item: ProgramSessionResolved["items"][number] }) {
  return (
    <Stack as="li" gap={2}>
      <div className="cap-cluster" data-align="baseline" data-gap="3">
        <Pill variant="secondary">{programKindLabel(item.kind)}</Pill>
        <ProgramItemTitle item={item} />
      </div>
      {item.startsAt ? (
        <Text size="small" tone="muted">
          {formatDate(item.startsAt, DATE_TIME)}
        </Text>
      ) : null}
      {item.note ? (
        <Text size="small" tone="muted">
          {item.note}
        </Text>
      ) : null}
    </Stack>
  );
}

// One session in its slot: the slot gives the time and the room; the session
// says who moderates and lists its items.
function SessionBlock({ session, level }: { session: ProgramSessionResolved; level: 3 | 4 | 5 }) {
  return (
    <ScheduleSession
      title={session.title}
      level={level}
      meta={session.moderator ? <p>Moderated by {session.moderator}</p> : undefined}
    >
      {session.items.length === 0 ? (
        <Text size="small" tone="muted">
          No items listed.
        </Text>
      ) : (
        <Stack as="ol" gap={4}>
          {session.items.map((item) => (
            <ProgramItemView key={item.id} item={item} />
          ))}
        </Stack>
      )}
    </ScheduleSession>
  );
}

function SpeakerList({ speakers }: { speakers: SpeakerPublic[] }) {
  return (
    <Stack as="section" gap={4}>
      <Title size={4}>Invited speakers</Title>
      <Stack as="ul">
        {speakers.map((speaker) => (
          <li key={speaker.id}>
            <article className="cap-card">
              <h3>{speaker.name}</h3>
              <div>
                <Text size="small" tone="muted">
                  {[speaker.role ? speakerRoleLabel(speaker.role) : "", speaker.affiliation ?? ""]
                    .filter((part) => part.length > 0)
                    .join(" . ")}
                </Text>
                {speaker.talkTitle ? <Text size="small">{speaker.talkTitle}</Text> : null}
                <RichText className="cap-text speaker-bio" data-size="small" html={speaker.bio} />
              </div>
            </article>
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

function SponsorList({ sponsors }: { sponsors: SponsorPublic[] }) {
  return (
    <Stack as="section" gap={4}>
      <Title size={4}>Sponsors</Title>
      <ul className="cap-cluster">
        {sponsors.map((sponsor) => (
          <Text as="li" key={sponsor.id} size="small">
            <article className="cap-card">
              <h3>
                {isHttpUrl(sponsor.url) ? <a href={sponsor.url}>{sponsor.name}</a> : sponsor.name}
              </h3>
              {sponsor.tier ? (
                <Text size="small" tone="muted">
                  {sponsor.tier}
                </Text>
              ) : null}
            </article>
          </Text>
        ))}
      </ul>
    </Stack>
  );
}

export default function PublicProgram({ loaderData }: Route.ComponentProps) {
  const { edition, program } = loaderData;
  const dateLine = dateRange(edition.meetingStartsAt, edition.meetingEndsAt) ?? "";
  const venueLine = joinParts([edition.venueName, edition.city]);

  return (
    <Stack gap={7}>
      <Breadcrumb
        renderLink={routerRenderLink}
        items={[
          { label: "Home", href: "/" },
          { label: "Meetings", href: "/meetings" },
          { label: `${edition.name} program` },
        ]}
      />
      <Stack gap={3}>
        <Title as="h1" size={2}>
          {edition.name}
        </Title>
        <Text size="lead" tone="ink">
          Program
        </Text>
        {dateLine ? <p className="cap-muted">{dateLine}</p> : null}
        {venueLine ? <p className="cap-muted">{venueLine}</p> : null}
      </Stack>

      {program === null ? (
        <Empty
          kind="nothing-yet"
          title="The program is not published yet. Check back closer to the meeting."
        />
      ) : program.days.length === 0 ? (
        <p>The program has no sessions listed yet.</p>
      ) : (
        <Stack gap={6}>
          {program.days.length > 1 ? (
            <ScheduleDayNav
              days={program.days.map((d) => d.key)}
              current={null}
              hrefFor={(key) => `#day-${key}`}
              label="Meeting days"
              noDate="To be scheduled"
              year={edition.past}
            />
          ) : null}
          <Schedule
            days={program.days}
            zone="UTC"
            idPrefix="day-"
            year={edition.past}
            keyOf={(s) => s.id}
            trackOf={(s) => s.location}
            noDate="To be scheduled"
            renderItem={(session, level) => (
              <SessionBlock session={session} level={level as 3 | 4 | 5} />
            )}
          />
        </Stack>
      )}

      {program && program.speakers.length > 0 ? <SpeakerList speakers={program.speakers} /> : null}

      {program && program.sponsors.length > 0 ? <SponsorList sponsors={program.sponsors} /> : null}

      {/* Printable Program PDF hooks in here as a follow-up build: assemble this
          same schedule (days, concurrency groups, items, speakers, sponsors) into
          a print document via Browser Rendering to R2, mirroring the abstract
          book pipeline (book.server.ts). Not built in this pass. */}
    </Stack>
  );
}
