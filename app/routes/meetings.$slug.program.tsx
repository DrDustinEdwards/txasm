import type { Route } from "./+types/meetings.$slug.program";
import { cloudflareContext } from "~/load-context";
import {
  NotFoundError,
  getDataAccess,
  type ProgramDay,
  type ProgramSessionResolved,
  type SpeakerPublic,
  type SponsorPublic,
} from "~/lib/data-access";
import { formatDateTime } from "~/lib/format";
import { programKindLabel, speakerRoleLabel } from "~/lib/vocab";
import { Breadcrumbs } from "~/components/breadcrumbs";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Program | Texas Branch ASM" }];
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

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "full",
  timeZone: "UTC",
});

function meetingDateLine(start: Date | null, end: Date | null): string {
  if (start && end) {
    if (start.getTime() === end.getTime()) return DATE_FMT.format(start);
    return `${DATE_FMT.format(start)} to ${DATE_FMT.format(end)}`;
  }
  if (start) return DATE_FMT.format(start);
  if (end) return DATE_FMT.format(end);
  return "";
}

function joinParts(parts: Array<string | null>): string {
  return parts
    .map((p) => (p ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join(", ");
}

function dayLabel(date: Date | null): string {
  return date ? `${DAY_FMT.format(date)} UTC` : "To be scheduled";
}

function sessionTimeLine(session: ProgramSessionResolved): string {
  const start = session.startsAt ? formatDateTime(session.startsAt) : "";
  const end = session.endsAt ? formatDateTime(session.endsAt) : "";
  const time = start && end ? `${start} to ${end}` : start || end;
  return joinParts([time || null, session.location]);
}

function KindBadge({ kind }: { kind: ProgramSessionResolved["items"][number]["kind"] }) {
  return (
    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
      {programKindLabel(kind)}
    </span>
  );
}

function ProgramItemView({
  item,
}: {
  item: ProgramSessionResolved["items"][number];
}) {
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <KindBadge kind={item.kind} />
        {item.abstractId ? (
          <p>
            {item.abstractNumber ? (
              <span className="font-medium text-gray-600 dark:text-gray-400">
                #{item.abstractNumber}{" "}
              </span>
            ) : null}
            <span
              className="font-medium"
              dangerouslySetInnerHTML={{ __html: item.abstractTitle ?? "" }}
            />
            {item.presentingAuthorName ? (
              <span className="text-gray-700 dark:text-gray-300">
                {" "}
                . {item.presentingAuthorName}
              </span>
            ) : null}
          </p>
        ) : item.speakerId ? (
          <p>
            <span className="font-medium">
              {item.speakerName ?? "Invited speaker"}
            </span>
            {item.speakerTalkTitle ? (
              <span className="text-gray-700 dark:text-gray-300">
                {" "}
                . {item.speakerTalkTitle}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="font-medium">{item.customTitle}</p>
        )}
      </div>
      {item.startsAt ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {formatDateTime(item.startsAt)}
        </p>
      ) : null}
      {item.note ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">{item.note}</p>
      ) : null}
    </li>
  );
}

function SessionBlock({
  session,
}: {
  session: ProgramSessionResolved;
}) {
  const timeLine = sessionTimeLine(session);
  return (
    <div className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800">
      <div>
        <h3 className="text-lg font-semibold">{session.title}</h3>
        {timeLine ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">{timeLine}</p>
        ) : null}
        {session.moderator ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Moderated by {session.moderator}
          </p>
        ) : null}
      </div>
      {session.items.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No items listed.
        </p>
      ) : (
        <ol className="space-y-3">
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
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
        {trackCount} parallel tracks
      </p>
      {/* N dynamic columns, one per concurrent track (never a fixed two). minmax
          keeps each track readable and lets the row scroll on narrow screens. */}
      <div className="overflow-x-auto">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${trackCount}, minmax(16rem, 1fr))`,
          }}
        >
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
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Invited speakers</h2>
      <ul className="space-y-4">
        {speakers.map((speaker) => (
          <li
            key={speaker.id}
            className="rounded border border-gray-200 p-4 dark:border-gray-800"
          >
            <p className="font-medium">{speaker.name}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {[
                speaker.role ? speakerRoleLabel(speaker.role) : "",
                speaker.affiliation ?? "",
              ]
                .filter((part) => part.length > 0)
                .join(" . ")}
            </p>
            {speaker.talkTitle ? (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {speaker.talkTitle}
              </p>
            ) : null}
            {speaker.bio ? (
              <div
                className="mt-2 text-sm text-gray-700 dark:text-gray-300"
                dangerouslySetInnerHTML={{ __html: speaker.bio }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SponsorList({ sponsors }: { sponsors: SponsorPublic[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Sponsors</h2>
      <ul className="flex flex-wrap gap-3">
        {sponsors.map((sponsor) => (
          <li
            key={sponsor.id}
            className="rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"
          >
            {sponsor.url ? (
              <a
                href={sponsor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                {sponsor.name}
              </a>
            ) : (
              <span className="font-medium">{sponsor.name}</span>
            )}
            {sponsor.tier ? (
              <span className="text-gray-600 dark:text-gray-400">
                {" "}
                . {sponsor.tier}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PublicProgram({ loaderData }: Route.ComponentProps) {
  const { edition, program } = loaderData;
  const dateLine = meetingDateLine(
    edition.meetingStartsAt,
    edition.meetingEndsAt,
  );
  const venueLine = joinParts([edition.venueName, edition.city]);

  return (
    <div className="space-y-8">
      <Breadcrumbs
        trail={[
          { label: "Home", to: "/" },
          { label: "Meetings", to: "/meetings" },
          { label: `${edition.name} program` },
        ]}
      />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {edition.name}
        </h1>
        <p className="text-lg text-gray-700 dark:text-gray-300">Program</p>
        {dateLine ? (
          <p className="text-gray-600 dark:text-gray-400">{dateLine}</p>
        ) : null}
        {venueLine ? (
          <p className="text-gray-600 dark:text-gray-400">{venueLine}</p>
        ) : null}
      </div>

      {program === null ? (
        <p className="rounded border border-gray-200 bg-gray-50 p-4 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          The program is not published yet. Check back closer to the meeting.
        </p>
      ) : program.days.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          The program has no sessions listed yet.
        </p>
      ) : (
        <div className="space-y-10">
          {program.days.map((day) => (
            <section key={day.key} className="space-y-4">
              <h2 className="border-b border-gray-200 pb-2 text-xl font-semibold dark:border-gray-800">
                {dayLabel(day.date)}
              </h2>
              <div className="space-y-6">
                {day.groups.map((group, index) => (
                  <TrackGroup key={group.sessions[0]?.id ?? index} group={group} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {program && program.speakers.length > 0 ? (
        <SpeakerList speakers={program.speakers} />
      ) : null}

      {program && program.sponsors.length > 0 ? (
        <SponsorList sponsors={program.sponsors} />
      ) : null}

      {/* Printable Program PDF hooks in here as a follow-up build: assemble this
          same schedule (days, concurrency groups, items, speakers, sponsors) into
          a print document via Browser Rendering to R2, mirroring the abstract
          book pipeline (book.server.ts). Not built in this pass. */}
    </div>
  );
}
