import { Text, Title } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import type { Route } from "./+types/trail";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";

export const headers = () => publicPageHeaders();

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
  2008, 1991, 1984, 1980, 1975, 1972, 1969, 1965, 1956, 1955, 1954, 1953, 1952, 1951, 1950, 1949,
  1948, 1947, 1946, 1945, 1944, 1943, 1942, 1941,
];

export default function Trail() {
  return (
    <Stack gap={7}>
      <Stack as="header" gap={4}>
        <Title as="h1" size={2}>
          Host cities of the Texas Branch
        </Title>
      </Stack>

      <Stack as="section" aria-label="Meetings on record">
        <ul className="cap-grid" data-cols="4" data-gap="3">
          {MEETING_YEARS.map((year) => (
            <li key={year}>
              <article className="cap-card">
                <h2>{year}</h2>
                <Text size="small" tone="muted">
                  Host city to be added
                </Text>
              </article>
            </li>
          ))}
        </ul>
      </Stack>
    </Stack>
  );
}
