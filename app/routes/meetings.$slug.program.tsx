import type { Route } from "./+types/meetings.$slug.program";
import { cloudflareContext } from "~/load-context";
import { NotFoundError, getDataAccess } from "~/lib/data-access";
import { formatDateTime } from "~/lib/format";
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
    sessions: program?.sessions ?? null,
  };
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
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

export default function PublicProgram({ loaderData }: Route.ComponentProps) {
  const { edition, sessions } = loaderData;
  const dateLine = meetingDateLine(
    edition.meetingStartsAt,
    edition.meetingEndsAt,
  );
  const venueLine = joinParts([edition.venueName, edition.city]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
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

      {sessions === null ? (
        <p className="rounded border border-gray-200 bg-gray-50 p-4 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          The program is not published yet. Check back closer to the meeting.
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          The program has no sessions listed yet.
        </p>
      ) : (
        <div className="space-y-8">
          {sessions.map((session) => (
            <section key={session.id} className="space-y-3">
              <div className="border-b border-gray-200 pb-2 dark:border-gray-800">
                <h2 className="text-xl font-semibold">{session.title}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {session.startsAt ? formatDateTime(session.startsAt) : ""}
                  {session.startsAt && session.endsAt ? " to " : ""}
                  {session.endsAt ? formatDateTime(session.endsAt) : ""}
                  {session.location
                    ? `${session.startsAt || session.endsAt ? " . " : ""}${session.location}`
                    : ""}
                </p>
              </div>

              {session.items.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No items listed.
                </p>
              ) : (
                <ol className="space-y-3">
                  {session.items.map((item) => (
                    <li key={item.id} className="space-y-1">
                      {item.abstractId ? (
                        <p>
                          {item.abstractNumber ? (
                            <span className="font-medium text-gray-600 dark:text-gray-400">
                              #{item.abstractNumber}{" "}
                            </span>
                          ) : null}
                          <span
                            className="font-medium"
                            dangerouslySetInnerHTML={{
                              __html: item.abstractTitle ?? "",
                            }}
                          />
                          {item.presentingAuthorName ? (
                            <span className="text-gray-700 dark:text-gray-300">
                              {" "}
                              . {item.presentingAuthorName}
                            </span>
                          ) : null}
                        </p>
                      ) : (
                        <p className="font-medium">{item.customTitle}</p>
                      )}
                      {item.startsAt ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDateTime(item.startsAt)}
                        </p>
                      ) : null}
                      {item.note ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {item.note}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
