import type { Route } from "./+types/meetings.$slug.program";
import { jsonLd } from "@drdustinedwards/site-helpers/schema";
import { meetingLd, pageHead } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import {
  NotFoundError,
  getDataAccess,
  type ProgramDay,
  type ProgramSessionResolved,
  type SpeakerPublic,
  type SponsorPublic,
} from "~/lib/data-access";
import { formatDateTime, formatMeetingDates, joinParts } from "~/lib/format";
import { programKindLabel, speakerRoleLabel } from "~/lib/vocab";
import { Breadcrumb } from "capsomer/react/breadcrumb";
import { Empty } from "capsomer/react/empty";
import { Badge } from "capsomer/react/status";
import { renderLink } from "~/components/site-chrome";

export function meta({ matches, location, loaderData }: Route.MetaArgs) {
  const edition = loaderData?.edition;
  const name = edition ? `${edition.name} program` : "Program";
  return [
    ...pageHead(matches, {
      path: location.pathname,
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
    },
    program,
  };
}

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "full",
  timeZone: "UTC",
});

function dayLabel(date: Date | null): string {
  return date ? `${DAY_FMT.format(date)} UTC` : "To be scheduled";
}

function sessionTimeLine(session: ProgramSessionResolved): string {
  const start = session.startsAt ? formatDateTime(session.startsAt) : "";
  const end = session.endsAt ? formatDateTime(session.endsAt) : "";
  const time = start && end ? `${start} to ${end}` : start || end;
  return joinParts([time || null, session.location]);
}

function ProgramItemView({ item }: { item: ProgramSessionResolved["items"][number] }) {
  return (
    <li className="stack-1">
      <div className="cluster program-item">
        <Badge variant="secondary">{programKindLabel(item.kind)}</Badge>
        {item.abstractId ? (
          <p>
            {item.abstractCode ? <span className="strong cap-muted">{item.abstractCode} </span> : null}
            <span className="strong" dangerouslySetInnerHTML={{ __html: item.abstractTitle ?? "" }} />
            {item.presentingAuthorName ? <span className="cap-muted"> . {item.presentingAuthorName}</span> : null}
          </p>
        ) : item.speakerId ? (
          <p>
            <span className="strong">{item.speakerName ?? "Invited speaker"}</span>
            {item.speakerTalkTitle ? <span className="cap-muted"> . {item.speakerTalkTitle}</span> : null}
          </p>
        ) : (
          <p className="strong">{item.customTitle}</p>
        )}
      </div>
      {item.startsAt ? <p className="small cap-muted">{formatDateTime(item.startsAt)}</p> : null}
      {item.note ? <p className="small cap-muted">{item.note}</p> : null}
    </li>
  );
}

function SessionBlock({ session }: { session: ProgramSessionResolved }) {
  const timeLine = sessionTimeLine(session);
  return (
    <div className="card stack-3">
      <div>
        <h3 className="subsection-title">{session.title}</h3>
        {timeLine ? <p className="small cap-muted">{timeLine}</p> : null}
        {session.moderator ? <p className="small cap-muted">Moderated by {session.moderator}</p> : null}
      </div>
      {session.items.length === 0 ? (
        <p className="small cap-muted">No items listed.</p>
      ) : (
        <ol className="stack-3">
          {session.items.map((item) => (
            <ProgramItemView key={item.id} item={item} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TrackGroup({ group }: { group: ProgramDay["groups"][number] }) {
  if (!group.concurrent) {
    return <SessionBlock session={group.sessions[0]} />;
  }
  const trackCount = group.sessions.length;
  return (
    <div className="stack-2">
      <p className="small strong cap-muted">{trackCount} parallel tracks</p>
      {/* N dynamic columns, one per concurrent track (never a fixed two). minmax
          keeps each track readable and lets the row scroll on narrow screens. */}
      <div className="tracks">
        <div style={{ gridTemplateColumns: `repeat(${trackCount}, minmax(16rem, 1fr))` }}>
          {group.sessions.map((session) => (
            <SessionBlock key={session.id} session={session} />
          ))}
        </div>
      </div>
    </div>
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
              {[speaker.role ? speakerRoleLabel(speaker.role) : "", speaker.affiliation ?? ""].filter((part) => part.length > 0).join(" . ")}
            </p>
            {speaker.talkTitle ? <p className="small">{speaker.talkTitle}</p> : null}
            {speaker.bio ? <div className="small speaker-bio" dangerouslySetInnerHTML={{ __html: speaker.bio }} /> : null}
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
              <a href={sponsor.url} target="_blank" rel="noopener noreferrer" className="strong">
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
  const dateLine = formatMeetingDates(
    edition.meetingStartsAt,
    edition.meetingEndsAt,
  );
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
        <Empty kind="nothing-yet" title="The program is not published yet. Check back closer to the meeting." />
      ) : program.days.length === 0 ? (
        <p>The program has no sessions listed yet.</p>
      ) : (
        <div className="stack-10">
          {program.days.map((day) => (
            <section key={day.key} className="stack-4">
              <h2 className="section-title rule-below">{dayLabel(day.date)}</h2>
              <div className="stack-6">
                {day.groups.map((group, index) => (
                  <TrackGroup key={group.sessions[0]?.id ?? index} group={group} />
                ))}
              </div>
            </section>
          ))}
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
