import { Link } from "react-router";
import type { Route } from "./+types/meetings";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { SEASON_LABELS } from "~/lib/vocab";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Meetings") },
    {
      name: "description",
      content:
        "Past meetings of the Texas Branch ASM, their programs, and their abstract archives.",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const meetings = await da.editions.listPublic();
  return { meetings };
}

function venueLine(venueName: string | null, city: string | null): string {
  return [venueName, city]
    .map((p) => (p ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join(", ");
}

export default function Meetings({ loaderData }: Route.ComponentProps) {
  const { meetings } = loaderData;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Meetings
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch meets twice a year. Browse a meeting's program and its
          archive of accepted abstracts.
        </p>
      </header>

      {meetings.length === 0 ? (
        <section
          aria-label="Meetings"
          className="rounded-lg border border-border bg-panel p-6"
        >
          <p className="text-text-muted">
            Meetings appear here once their programs are published.
          </p>
        </section>
      ) : (
        <section aria-label="Meetings">
          <ul className="space-y-4">
            {meetings.map((meeting) => {
              const venue = venueLine(meeting.venueName, meeting.city);
              return (
                <li
                  key={meeting.slug}
                  className="rounded-lg border border-border bg-surface-raised p-5"
                >
                  <h2 className="text-lg font-semibold text-text">
                    {meeting.name}
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    {[`${SEASON_LABELS[meeting.season]} ${meeting.year}`, venue]
                      .filter((p) => p.length > 0)
                      .join(" · ")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <Link
                      to={`/meetings/${meeting.slug}/abstracts`}
                      className="font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      Abstracts ({meeting.abstractCount})
                    </Link>
                    <Link
                      to={`/meetings/${meeting.slug}/program`}
                      className="font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      Program
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
