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
import { renderLink } from "~/components/site-chrome";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import schedule from "capsomer/schedule.css?url";

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
    <li className="stack-1">
      <div className="cluster program-item">
        <Pill variant="secondary">{programKindLabel(item.kind)}</Pill>
        {item.abstractId ? (
          <p>
            {item.abstractCode ? (
              <span className="strong cap-muted">{item.abstractCode} </span>
            ) : null}
            <RichText as="span" className="strong" html={item.abstractTitle} />
            {item.presentingAuthorName ? (
              <span className="cap-muted"> . {item.presentingAuthorName}</span>
            ) : null}
          </p>
        ) : item.speakerId ? (
          <p>
            <span className="strong">{item.speakerName ?? "Invited speaker"}</span>
            {item.speakerTalkTitle ? (
              <span className="cap-muted"> . {item.speakerTalkTitle}</span>
            ) : null}
          </p>
        ) : (
          <p className="strong">{item.customTitle}</p>
        )}
      </div>
      {item.startsAt ? (
        <p className="small cap-muted">{formatDate(item.startsAt, DATE_TIME)}</p>
      ) : null}
      {item.note ? <p className="small cap-muted">{item.note}</p> : null}
    </li>
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
        <p className="small cap-muted">No items listed.</p>
      ) : (
        <ol className="stack-3">
          {session.items.map((item) => (
            <ProgramItemView key={item.id} item={item} />
          ))}
        </ol>
      )}
    </ScheduleSession>
  );
}

function SpeakerList({ speakers }: { speakers: SpeakerPublic[] }) {
  return (
    <section className="stack-3">
      <h2 className="section-title">Invited speakers</h2>
      <ul className="stack-4">
        {speakers.map((speaker) => (
          <li key={speaker.id} className="card">
            <p className="strong">{speaker.name}</p>
            <p className="small cap-muted">
              {[speaker.role ? speakerRoleLabel(speaker.role) : "", speaker.affiliation ?? ""]
                .filter((part) => part.length > 0)
                .join(" . ")}
            </p>
            {speaker.talkTitle ? <p className="small">{speaker.talkTitle}</p> : null}
            <RichText className="small speaker-bio" html={speaker.bio} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SponsorList({ sponsors }: { sponsors: SponsorPublic[] }) {
  return (
    <section className="stack-3">
      <h2 className="section-title">Sponsors</h2>
      <ul className="cluster">
        {sponsors.map((sponsor) => (
          <li key={sponsor.id} className="card small sponsor">
            {sponsor.url && /^https?:\/\//i.test(sponsor.url) ? (
              <a href={sponsor.url} className="strong">
                {sponsor.name}
              </a>
            ) : (
              <span className="strong">{sponsor.name}</span>
            )}
            {sponsor.tier ? <span className="cap-muted"> . {sponsor.tier}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PublicProgram({ loaderData }: Route.ComponentProps) {
  const { edition, program } = loaderData;
  const dateLine = dateRange(edition.meetingStartsAt, edition.meetingEndsAt) ?? "";
  const venueLine = joinParts([edition.venueName, edition.city]);

  return (
    <div className="stack-8">
      <Breadcrumb
        renderLink={renderLink}
        items={[
          { label: "Home", href: "/" },
          { label: "Meetings", href: "/meetings" },
          { label: `${edition.name} program` },
        ]}
      />
      <div className="stack-2">
        <h1 className="page-title">{edition.name}</h1>
        <p className="home-tagline">Program</p>
        {dateLine ? <p className="cap-muted">{dateLine}</p> : null}
        {venueLine ? <p className="cap-muted">{venueLine}</p> : null}
      </div>

      {program === null ? (
        <Empty
          kind="nothing-yet"
          title="The program is not published yet. Check back closer to the meeting."
        />
      ) : program.days.length === 0 ? (
        <p>The program has no sessions listed yet.</p>
      ) : (
        <div className="stack-6">
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
        </div>
      )}

      {program && program.speakers.length > 0 ? <SpeakerList speakers={program.speakers} /> : null}

      {program && program.sponsors.length > 0 ? <SponsorList sponsors={program.sponsors} /> : null}

      {/* Printable Program PDF hooks in here as a follow-up build: assemble this
          same schedule (days, concurrency groups, items, speakers, sponsors) into
          a print document via Browser Rendering to R2, mirroring the abstract
          book pipeline (book.server.ts). Not built in this pass. */}
    </div>
  );
}
