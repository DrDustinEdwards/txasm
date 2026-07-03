import { Form, Link, NavLink, Outlet, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/public.layout";
import type { loader as rootLoader } from "~/root";
import { getUserContext } from "~/lib/auth.server";
import type { PlatformSettings } from "~/lib/data-access";
import { NavMenu, type NavMenuGroup } from "~/components/nav-menu";
import { OffCanvas } from "~/components/off-canvas";
import { ThemeToggle } from "~/components/theme-toggle";

// Public shell: sticky top bar and footer around every public page. Auth state
// is read the same way as before; only the presentation changed. No loader,
// action, or gating on the wrapped routes is touched.
export async function loader({ request }: Route.LoaderArgs) {
  const { user, isAdmin, isReviewer } = await getUserContext(request);
  return { email: user?.email ?? null, isAdmin, isReviewer };
}

const MEETINGS_GROUPS: NavMenuGroup[] = [
  {
    heading: "This meeting",
    items: [
      { label: "Registration", to: "/register" },
      { label: "Programs", to: "/meetings" },
      { label: "Abstracts", to: "/my/abstracts" },
    ],
  },
  {
    heading: "Branch",
    items: [
      { label: "Newsletters", to: "/newsletters" },
      { label: "Trail", to: "/trail" },
      { label: "Sponsorship", to: "/sponsorship" },
    ],
  },
];

const AWARDS_GROUPS: NavMenuGroup[] = [
  {
    items: [
      { label: "All awards", to: "/awards" },
      { label: "Nominations", to: "/award-nominations" },
      { label: "Awardees", to: "/awardees" },
    ],
  },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    isActive ? "text-link" : "text-text hover:bg-panel",
  ].join(" ");

const utilityLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-md px-2 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    isActive ? "text-link" : "text-text-muted hover:text-text",
  ].join(" ");

function MobileGroup({ group }: { group: NavMenuGroup }) {
  return (
    <div>
      {group.heading ? (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {group.heading}
        </p>
      ) : null}
      <ul className="space-y-0.5">
        {group.items.map((item) => (
          <li key={`${item.to}-${item.label}`}>
            <Link
              to={item.to}
              className="block rounded px-2 py-1.5 text-sm text-text hover:bg-panel hover:text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileNav({
  email,
  isAdmin,
  isReviewer,
}: {
  email: string | null;
  isAdmin: boolean;
  isReviewer: boolean;
}) {
  return (
    <div className="space-y-5">
      <nav aria-label="Sections" className="space-y-4">
        <Link
          to="/officers"
          className="block rounded px-2 py-1.5 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Officers
        </Link>
        <div className="space-y-2">
          <p className="px-2 text-sm font-semibold text-text">Meetings</p>
          {MEETINGS_GROUPS.map((group, index) => (
            <MobileGroup key={group.heading ?? index} group={group} />
          ))}
        </div>
        <div className="space-y-2">
          <p className="px-2 text-sm font-semibold text-text">Awards</p>
          {AWARDS_GROUPS.map((group, index) => (
            <MobileGroup key={group.heading ?? index} group={group} />
          ))}
        </div>
      </nav>

      <div className="space-y-1 border-t border-border pt-4">
        {email ? (
          <>
            <Link
              to="/my/abstracts"
              className="block rounded px-2 py-1.5 text-sm text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              My abstracts
            </Link>
            {isReviewer ? (
              <Link
                to="/review"
                className="block rounded px-2 py-1.5 text-sm text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Review
              </Link>
            ) : null}
            {isAdmin ? (
              <Link
                to="/admin"
                className="block rounded px-2 py-1.5 text-sm text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Admin
              </Link>
            ) : null}
            <p className="px-2 pt-1 text-sm text-text-muted">{email}</p>
            <Form method="post" action="/signout">
              <button
                type="submit"
                className="w-full rounded px-2 py-1.5 text-left text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Sign out
              </button>
            </Form>
          </>
        ) : (
          <Link
            to="/signin"
            className="block rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}

function PublicHeader({
  email,
  isAdmin,
  isReviewer,
  wordmark,
}: {
  email: string | null;
  isAdmin: boolean;
  isReviewer: boolean;
  wordmark: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-1">
          <div className="md:hidden">
            <OffCanvas triggerLabel="Open menu" title="Menu" side="left">
              <MobileNav
                email={email}
                isAdmin={isAdmin}
                isReviewer={isReviewer}
              />
            </OffCanvas>
          </div>
          <Link
            to="/"
            className="rounded-md px-2 py-1 text-base font-semibold tracking-tight text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {wordmark}
          </Link>
          <nav aria-label="Primary" className="ml-2 hidden items-center gap-1 md:flex">
            <NavLink to="/officers" className={navLinkClass}>
              Officers
            </NavLink>
            <NavMenu label="Meetings" groups={MEETINGS_GROUPS} />
            <NavMenu label="Awards" groups={AWARDS_GROUPS} />
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <div className="hidden items-center gap-1 md:flex">
            {email ? (
              <>
                <NavLink to="/my/abstracts" className={utilityLinkClass}>
                  My abstracts
                </NavLink>
                {isReviewer ? (
                  <NavLink to="/review" className={utilityLinkClass}>
                    Review
                  </NavLink>
                ) : null}
                {isAdmin ? (
                  <NavLink to="/admin" className={utilityLinkClass}>
                    Admin
                  </NavLink>
                ) : null}
                <span className="hidden px-2 text-sm text-text-muted lg:inline">
                  {email}
                </span>
                <Form method="post" action="/signout">
                  <button
                    type="submit"
                    className="rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Sign out
                  </button>
                </Form>
              </>
            ) : (
              <NavLink
                to="/signin"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Sign in
              </NavLink>
            )}
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function FooterLink({ label, url }: { label: string; url: string }) {
  // External links (http/https or mailto) are plain anchors; internal paths route.
  if (/^(https?:|mailto:)/i.test(url)) {
    return (
      <a
        href={url}
        target={url.startsWith("mailto:") ? undefined : "_blank"}
        rel="noreferrer"
        className="text-link hover:underline"
      >
        {label}
      </a>
    );
  }
  return (
    <Link to={url} className="text-link hover:underline">
      {label}
    </Link>
  );
}

function PublicFooter({ settings }: { settings: PlatformSettings | undefined }) {
  const orgFullName = settings?.orgFullName ?? "";
  const foundingYear = settings?.foundingYear ?? null;
  const copyrightName = settings?.orgName || orgFullName;
  const foundedLine = orgFullName
    ? foundingYear
      ? `${orgFullName}. Founded in ${foundingYear}.`
      : `${orgFullName}.`
    : "";

  return (
    <footer className="mt-16 border-t border-border bg-panel">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {(settings?.footerLinks ?? []).map((link) => (
            <FooterLink
              key={`${link.label}-${link.url}`}
              label={link.label}
              url={link.url}
            />
          ))}
          <FooterLink label="Contact" url="/contact" />
          {settings?.facebookUrl ? (
            <FooterLink label="Facebook group" url={settings.facebookUrl} />
          ) : null}
        </nav>
        {foundedLine ? (
          <p className="mt-6 text-text-muted">{foundedLine}</p>
        ) : null}
        {copyrightName ? (
          <p className="mt-1 text-text-muted">&copy; {copyrightName}</p>
        ) : null}
      </div>
    </footer>
  );
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const settings: PlatformSettings | undefined = rootData?.settings;

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader
        email={loaderData.email}
        isAdmin={loaderData.isAdmin}
        isReviewer={loaderData.isReviewer}
        wordmark={settings?.shortName ?? ""}
      />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Outlet />
      </main>
      <PublicFooter settings={settings} />
    </div>
  );
}
