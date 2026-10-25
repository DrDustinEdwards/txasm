import { useRouteLoaderData } from "react-router";
import { Banner } from "capsomer/react/banner";
import type { Route } from "./+types/trail";
import type { loader as rootLoader } from "~/root";
import { pageHead } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/trail",
    name: "Trail",
    description:
      "Host cities of the Texas Branch ASM meetings, a history going back to the branch's founding.",
  });
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
    <div className="stack-8">
      <header className="stack-3">
        <h1 className="page-title">Host cities of the Texas Branch</h1>
        <p className="lead">
          The branch has gathered across Texas twice a year since its
          {foundingYear ? ` founding in ${foundingYear}` : " founding"}. This
          trail records the meetings on file and the cities that hosted them.
        </p>
      </header>

      <section aria-labelledby="trail-heading" className="stack-4">
        <h2 id="trail-heading" className="section-title">
          Meetings on record
        </h2>
        <Banner tone="info">The host city for each year is being added. The years currently on record are listed below.</Banner>
        <ul className="grid-4 trail-years">
          {MEETING_YEARS.map((year) => (
            <li key={year} className="card">
              <p className="strong">{year}</p>
              <p className="small cap-muted">Host city to be added</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
