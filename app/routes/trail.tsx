import { useRouteLoaderData } from "react-router";
import type { Route } from "./+types/trail";
import type { loader as rootLoader } from "~/root";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Trail") },
    {
      name: "description",
      content:
        "Host cities of the Texas Branch ASM meetings, a history going back to the branch's founding.",
    },
  ];
}

// Years on record for branch meetings, from the current site's Trail page. The
// live page pairs each year with its host city; only the year axis was captured,
// so cities are pending.
// TODO: add the host city for each year (and any missing years) once the full
// city-year list is fetched. Render as year plus city when available.
const MEETING_YEARS = [
  2008, 1991, 1984, 1980, 1975, 1972, 1969, 1965, 1956, 1955, 1954, 1953, 1952,
  1951, 1950, 1949, 1948, 1947, 1946, 1945, 1944, 1943, 1942, 1941,
];

export default function Trail() {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const foundingYear = rootData?.settings?.foundingYear ?? null;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Host cities of the Texas Branch
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch has gathered across Texas twice a year since its
          {foundingYear ? ` founding in ${foundingYear}` : " founding"}. This
          trail records the meetings on file and the cities that hosted them.
        </p>
      </header>

      <section aria-labelledby="trail-heading" className="space-y-4">
        <h2 id="trail-heading" className="text-xl font-semibold text-text">
          Meetings on record
        </h2>
        <div className="rounded-lg border border-border bg-panel p-4">
          <p className="text-sm text-text-muted">
            The host city for each year is being added. The years currently on
            record are listed below.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {MEETING_YEARS.map((year) => (
            <li
              key={year}
              className="rounded-lg border border-border bg-surface-raised px-4 py-3"
            >
              <p className="font-medium text-text">{year}</p>
              <p className="mt-1 text-sm text-text-muted">Host city to be added</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
