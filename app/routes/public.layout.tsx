import { Form, Link, NavLink, Outlet } from "react-router";
import type { Route } from "./+types/public.layout";
import { getUserContext } from "~/lib/auth.server";
import { NavMenu, type NavMenuGroup } from "~/components/nav-menu";
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
      { label: "Nominations", to: "/awards/nominations" },
      { label: "Awardees", to: "/awardees" },
    ],
  },
];

const FACEBOOK_GROUP_URL = "https://www.facebook.com/groups/texasbranchasm";

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

function PublicHeader({
  email,
  isAdmin,
  isReviewer,
}: {
  email: string | null;
  isAdmin: boolean;
  isReviewer: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-1">
          <Link
            to="/"
            className="rounded-md px-2 py-1 text-base font-semibold tracking-tight text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            TXASM
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
          {email ? (
            <>
              <NavLink
                to="/my/abstracts"
                className={utilityLinkClass}
              >
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
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-panel">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/officers" className="text-link hover:underline">
            Officers
          </Link>
          <Link to="/awardees" className="text-link hover:underline">
            Awards
          </Link>
          <Link to="/contact" className="text-link hover:underline">
            Contact
          </Link>
          <a
            href={FACEBOOK_GROUP_URL}
            target="_blank"
            rel="noreferrer"
            className="text-link hover:underline"
          >
            Facebook group
          </a>
        </nav>
        <p className="mt-6 text-text-muted">
          Texas Branch of the American Society for Microbiology. Founded in 1941.
        </p>
        <p className="mt-1 text-text-muted">
          &copy; Texas Branch ASM
        </p>
      </div>
    </footer>
  );
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader
        email={loaderData.email}
        isAdmin={loaderData.isAdmin}
        isReviewer={loaderData.isReviewer}
      />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
