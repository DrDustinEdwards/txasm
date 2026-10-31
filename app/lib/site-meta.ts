import { articleDates, defineHead } from "@drdustinedwards/site-helpers/head";
import { graph, thing, website } from "@drdustinedwards/site-helpers/schema";
import type { PageSearch, PlatformSettings } from "./data-access";
import { CATEGORY_PATHS } from "./document-nav";

// The root loader (settings) is always in the matches chain. Pull the org short
// name from there so page titles track the settings value instead of hardcoding
// the branch name in every route. React Router 8 names a match's data
// `loaderData`; the older `data` is gone. Type-only import, erased at build.
type RootMatch = { id: string; loaderData?: { settings?: PlatformSettings; origin?: string } };

const rootData = (matches: ReadonlyArray<{ id: string } | undefined>) =>
  (matches as ReadonlyArray<RootMatch | undefined>).find((match) => match?.id === "root")?.loaderData;

function titleSuffix(matches: ReadonlyArray<{ id: string } | undefined>): string {
  const shortName = rootData(matches)?.settings?.shortName ?? "";
  return shortName ? ` | ${shortName}` : "";
}

export function pageTitle(
  matches: ReadonlyArray<{ id: string } | undefined>,
  pageName: string,
): string {
  return `${pageName}${titleSuffix(matches)}`;
}

/** A signed-in or admin page's meta: its title and noindex (the Worker also sends X-Robots-Tag on these paths). */
export function privateMeta(matches: ReadonlyArray<{ id: string } | undefined>, pageName: string) {
  return [{ title: pageTitle(matches, pageName) }, { name: "robots", content: "noindex" }];
}

/** The production origin: canonicals, the sitemap and robots.txt name it, never the request's. */
export const SITE_ORIGIN = "https://txasm.org";

/** The site's IndexNow key, public by the protocol's design: served as /<key>.txt and sent with each changed page. */
export const INDEXNOW_KEY = "5e48c50f124668e3b36677ac35cee9de";

/** The site's RSS feed: new newsletters, abstract books and programs (app/routes/rss.ts). */
export const FEED_PATH = "/rss.xml";

/** Where the emailed sign-in link opens (site-runtime ./sign-in's confirmPath): under /signin, so it is private. */
export const SIGN_IN_CONFIRM_PATH = "/signin/confirm";

/** The vulnerability contact /.well-known/security.txt lists, and the date it is next confirmed by. */
export const SECURITY_CONTACT = "security@dustinedwards.info";
export const SECURITY_TXT_EXPIRES = "2027-09-28T00:00:00Z";
/** The site's short name: og:site_name, and the error page's title when the settings are out of reach. */
export const SITE_NAME = "Texas Branch ASM";
const SITE_CARD = {
  url: "/og-card.png",
  width: 1200,
  height: 630,
  alt: "Texas Branch of the American Society for Microbiology",
};

/** Signed-in, admin and API paths, kept out of /robots.txt and /ai.txt alike. */
export const ROBOTS_DISALLOW = [
  "/admin",
  "/api/",
  "/account",
  "/my/",
  "/review",
  "/submit/",
  "/abstracts/",
  "/signin",
  "/signout",
];

/** True for a path under ROBOTS_DISALLOW: those responses carry X-Robots-Tag: noindex. */
export function isPrivatePath(pathname: string): boolean {
  return ROBOTS_DISALLOW.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

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

/** The section pages a page's breadcrumb trail passes through. */
const SECTIONS: Record<string, string> = {
  "/meetings": "Meetings",
  ...Object.fromEntries(Object.values(CATEGORY_PATHS).map((c) => [c.basePath, c.title])),
};

/**
 * A public page's head from Prelum's defineHead: the title (the settings short name as its suffix, dropped where both do
 * not fit), description (cut at a word for search, whole on the share card), canonical on SITE_ORIGIN (a trailing slash
 * dropped, except on "/"), Open Graph and Twitter with the site card, and the WebPage and BreadcrumbList graph. The card
 * is named on the origin the page was served from (the root loader's), not SITE_ORIGIN: until the cutover txasm.org is
 * the old site, which has no card.
 */
export function pageHead(
  matches: ReadonlyArray<{ id: string } | undefined>,
  {
    name,
    search,
    ...page
  }: {
    path: string;
    name: string;
    description: string;
    fullTitle?: boolean;
    pageType?: string;
    breadcrumbs?: Array<{ name: string; path: string }>;
    /** A Carrel page's search fields: searchTitle is the <title> (the share card keeps the name), image the card. */
    search?: PageSearch | null;
  },
) {
  const head = defineHead({ origin: SITE_ORIGIN, siteName: SITE_NAME, image: SITE_CARD, suffix: titleSuffix(matches), sections: SECTIONS });
  const origin = rootData(matches)?.origin ?? SITE_ORIGIN;
  const image = search?.image
    ? { url: `${origin}${search.image.url}`, width: search.image.width ?? undefined, height: search.image.height ?? undefined, alt: search.image.alt }
    : { ...SITE_CARD, url: `${origin}${SITE_CARD.url}` };
  return head({
    ...page,
    title: search?.searchTitle ?? name,
    ...(search?.searchTitle ? { socialTitle: name } : {}),
    canonical: search?.canonical,
    noindex: search?.noindex,
    image,
  });
}

/** The site, which every page's WebPage names by its @id, and the branch as an Organization (home page). */
export function siteLd() {
  return graph([website({ origin: SITE_ORIGIN, name: SITE_NAME }), organizationLd()]);
}

function organizationLd() {
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
