import { articleDates, headTags } from "@drdustinedwards/site-helpers/head";
import { thing } from "@drdustinedwards/site-helpers/schema";
import type { PlatformSettings } from "./data-access";

// Route meta runs without the page's own loader data on these static content
// pages, but the root loader (settings) is always in the matches chain. Pull the
// org short name from there so page titles track the settings value instead of
// hardcoding the branch name in every route. Type-only import, erased at build.
type RootMatch = { id: string; data?: { settings?: PlatformSettings } };

export function pageTitle(
  matches: ReadonlyArray<{ id: string } | undefined>,
  pageName: string,
): string {
  const root = (matches as ReadonlyArray<RootMatch | undefined>).find(
    (match) => match?.id === "root",
  );
  const shortName = root?.data?.settings?.shortName ?? "";
  return shortName ? `${pageName} | ${shortName}` : pageName;
}

/** The production origin: canonicals, the sitemap and robots.txt name it, never the request's. */
export const SITE_ORIGIN = "https://txasm.org";
const SITE_NAME = "Texas Branch ASM";
const SITE_CARD = {
  url: "/og-card.png",
  width: 1200,
  height: 630,
  alt: "Texas Branch of the American Society for Microbiology",
};

/** Text of a sanitized HTML fragment (an abstract title), for a meta tag. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A public page's head from Prelum's headTags: the title (with the settings short name, as
 * pageTitle), description, canonical on SITE_ORIGIN, Open Graph and Twitter with the site card.
 */
export function pageHead(
  matches: ReadonlyArray<{ id: string } | undefined>,
  page: { path: string; name: string; description: string; fullTitle?: boolean },
) {
  return headTags({
    origin: SITE_ORIGIN,
    path: page.path,
    title: page.fullTitle ? page.name : pageTitle(matches, page.name),
    description: page.description,
    image: SITE_CARD,
    siteName: SITE_NAME,
  });
}

/** The branch as an Organization (home page). */
export function organizationLd() {
  return thing("Organization", {
    name: "Texas Branch of the American Society for Microbiology",
    alternateName: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/txasm-logo.svg`,
    parentOrganization: { "@type": "Organization", name: "American Society for Microbiology", url: "https://asm.org" },
  });
}

/** A meeting as a schema.org Event, on its program page. Fields the edition lacks are left out. */
export function meetingLd(
  edition: {
    name: string;
    meetingStartsAt: Date | string | null;
    meetingEndsAt: Date | string | null;
    venueName: string | null;
    city: string | null;
  },
  path: string,
) {
  const { published: startDate, modified: endDate } = articleDates({
    published: edition.meetingStartsAt,
    modified: edition.meetingEndsAt,
  });
  return thing("Event", {
    name: edition.name,
    url: `${SITE_ORIGIN}${path}`,
    startDate,
    endDate: edition.meetingEndsAt ? endDate : undefined,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location:
      edition.venueName || edition.city
        ? thing("Place", {
            name: edition.venueName ?? edition.city,
            address: edition.city ? `${edition.city}, Texas` : undefined,
          })
        : undefined,
    organizer: { "@type": "Organization", name: SITE_NAME, url: `${SITE_ORIGIN}/` },
  });
}
