import { Outlet, useLocation, useRouteLoaderData, useSubmit } from "react-router";
import { SiteHeader, type HeaderGroup, type HeaderSection } from "capsomer/react/site-header";
import type { Route } from "./+types/public.layout";
import type { loader as rootLoader } from "~/root";
import { getUserContext } from "~/lib/auth.server";
import { BrandFooter, BrandWordmark } from "~/lib/brand";
import type { PlatformSettings } from "~/lib/data-access";
import { initials, renderLink, THEME_PREF_KEY, useThemeCookie } from "~/components/site-chrome";
import { FEED_PATH } from "~/lib/site-meta";

// Public shell: Capsomer's site header and txasm's footer around every public
// page. Auth state is read the same way as before; only the presentation
// changed. No loader, action, or gating on the wrapped routes is touched.
export async function loader({ request }: Route.LoaderArgs) {
  const { user, isAdmin, isReviewer } = await getUserContext(request);
  return { email: user?.email ?? null, isAdmin, isReviewer };
}

// The site's RSS feed (app/routes/rss.ts), on every public page so a reader finds it from any.
export const links: Route.LinksFunction = () => [
  { rel: "alternate", type: "application/rss+xml", title: "Texas Branch ASM", href: FEED_PATH },
];

const link = (label: string, href: string) => ({ id: `${href}-${label}`, label, href });

const MEETINGS_GROUPS: HeaderGroup[] = [
  { label: "This meeting", links: [link("Registration", "/register"), link("Programs", "/meetings"), link("Abstracts", "/my/abstracts")] },
  { label: "Branch", links: [link("Newsletters", "/newsletters"), link("Trail", "/trail"), link("Sponsorship", "/sponsorship")] },
  {
    label: "Archive",
    links: [link("Meetings and abstracts", "/meetings"), link("Abstract books", "/archive/abstract-books"), link("Programs", "/archive/programs")],
  },
];

const AWARDS_GROUPS: HeaderGroup[] = [{ links: [link("Awardees", "/awardees"), link("Nominations", "/award-nominations")] }];

const isOn = (pathname: string, groups: HeaderGroup[]) =>
  groups.some((g) => g.links.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`)));

function PublicHeader({ email, isAdmin, isReviewer, wordmark }: { email: string | null; isAdmin: boolean; isReviewer: boolean; wordmark: string }) {
  const { pathname } = useLocation();
  const submit = useSubmit();
  const sections: HeaderSection[] = [
    { id: "officers", label: "Officers", href: "/branch-officers", current: pathname.startsWith("/branch-officers") },
    { id: "meetings", label: "Meetings", groups: MEETINGS_GROUPS, current: isOn(pathname, MEETINGS_GROUPS) },
    { id: "awards", label: "Awards", groups: AWARDS_GROUPS, current: isOn(pathname, AWARDS_GROUPS) },
  ];
  const rows = [
    { label: "My abstracts", href: "/my/abstracts" },
    ...(isReviewer ? [{ label: "Review", href: "/review" }] : []),
    ...(isAdmin ? [{ label: "Admin", href: "/admin" }] : []),
    { label: "Passkeys", href: "/account" },
  ].map((r) => ({ ...r, current: pathname.startsWith(r.href) }));
  return (
    <SiteHeader
      logo={{ href: "/", label: wordmark || "TXASM", wordmark: <BrandWordmark className="txasm-wordmark" /> }}
      sections={sections}
      themePrefKey={THEME_PREF_KEY}
      account={
        email
          ? { name: email, initials: initials(email), groups: [{ links: rows }], onSignOut: () => void submit(null, { method: "post", action: "/signout" }) }
          : undefined
      }
      signIn={email ? undefined : { href: "/signin" }}
      skipTo="#main"
      sheetTitle="Menu"
      renderLink={renderLink}
    />
  );
}

function FooterLink({ label, url }: { label: string; url: string }) {
  // External links open in a new tab; mailto and internal paths do not.
  if (/^https?:/i.test(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }
  return renderLink({ href: url, children: label });
}

function PublicFooter({ settings }: { settings: PlatformSettings | undefined }) {
  const orgFullName = settings?.orgFullName ?? "";
  const copyrightName = settings?.orgName || orgFullName;
  const footerLinks = settings?.footerLinks ?? [];
  // Contact is always offered; an admin's own /contact link stands in for it.
  const hasContact = footerLinks.some((link) => link.url === "/contact");

  return (
    <footer className="txasm-footer">
      <div className="txasm-frame">
        <nav aria-label="Footer">
          {footerLinks.map((link) => (
            <FooterLink key={`${link.label}-${link.url}`} label={link.label} url={link.url} />
          ))}
          {hasContact ? null : <FooterLink label="Contact" url="/contact" />}
          {settings?.facebookUrl ? <FooterLink label="Facebook group" url={settings.facebookUrl} /> : null}
        </nav>
        {/* Decorative footer wordmark; the copyright line below names the org, so
            the wrapper is aria-hidden to keep it out of assistive tech. */}
        <span aria-hidden="true">
          <BrandFooter />
        </span>
        {copyrightName ? <p className="cap-muted">&copy; {copyrightName}</p> : null}
      </div>
    </footer>
  );
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const settings: PlatformSettings | undefined = rootData?.settings;
  useThemeCookie(rootData?.theme ?? null);

  return (
    <div className="txasm-page">
      <PublicHeader email={loaderData.email} isAdmin={loaderData.isAdmin} isReviewer={loaderData.isReviewer} wordmark={settings?.shortName ?? ""} />
      <main id="main" tabIndex={-1} className="txasm-frame txasm-main">
        <Outlet />
      </main>
      <PublicFooter settings={settings} />
    </div>
  );
}
