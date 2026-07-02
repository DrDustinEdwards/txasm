import {
  Form,
  Link,
  NavLink,
  Outlet,
  useMatches,
  useParams,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/admin.layout";
import type { loader as rootLoader } from "~/root";
import { getUserContext } from "~/lib/auth.server";
import { OffCanvas } from "~/components/off-canvas";
import { ThemeToggle } from "~/components/theme-toggle";

// Admin shell. This layout does NOT gate; each wrapped route keeps its own
// requireAdmin or requireChair. Here we only read the existing user context to
// decide which nav items to show, and the active meeting name for the top bar.
export async function loader({ request }: Route.LoaderArgs) {
  const { user, isAdmin, isReviewer } = await getUserContext(request);
  return { email: user?.email ?? null, isAdmin, isReviewer };
}

interface MatchData {
  edition?: { name?: string };
}

// The active meeting name comes from whichever matched admin route already loads
// an edition, so the top bar reflects context without a new query.
function useActiveMeetingName(): string | null {
  const matches = useMatches();
  for (const match of matches) {
    const data = (match as { data?: MatchData }).data;
    if (data?.edition?.name) return data.edition.name;
  }
  return null;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "block rounded-md px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    isActive
      ? "bg-surface-raised font-medium text-text"
      : "text-text-muted hover:bg-surface-raised hover:text-text",
  ].join(" ");

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

// The sidebar navigation, shared by the desktop rail and (later) the off-canvas
// menu. Items are shown by what the user already has: admins see meeting config,
// a selected meeting shows its chair tools, reviewers see their queue.
export function AdminNav({
  isAdmin,
  isReviewer,
  editionId,
}: {
  isAdmin: boolean;
  isReviewer: boolean;
  editionId?: string;
}) {
  return (
    <nav aria-label="Admin" className="space-y-6 p-4">
      {isAdmin ? (
        <SidebarSection title="Meetings">
          <li>
            <NavLink to="/admin" end className={linkClass}>
              All meetings
            </NavLink>
          </li>
          <li>
            <NavLink to="/admin/editions/new" className={linkClass}>
              New meeting
            </NavLink>
          </li>
        </SidebarSection>
      ) : null}

      {isAdmin ? (
        <SidebarSection title="Platform">
          <li>
            <NavLink to="/admin/settings" className={linkClass}>
              Settings
            </NavLink>
          </li>
        </SidebarSection>
      ) : null}

      {editionId ? (
        <SidebarSection title="This meeting">
          <li>
            <NavLink to={`/admin/editions/${editionId}`} end className={linkClass}>
              Overview
            </NavLink>
          </li>
          <li>
            <NavLink
              to={`/admin/editions/${editionId}/categories`}
              className={linkClass}
            >
              Registration categories
            </NavLink>
          </li>
          <li>
            <NavLink
              to={`/admin/editions/${editionId}/abstract-categories`}
              className={linkClass}
            >
              Abstract categories
            </NavLink>
          </li>
          <li>
            <NavLink
              to={`/admin/editions/${editionId}/roles`}
              className={linkClass}
            >
              Chairs and reviewers
            </NavLink>
          </li>
          <li>
            <NavLink
              to={`/admin/editions/${editionId}/review`}
              className={linkClass}
            >
              Assign reviewers
            </NavLink>
          </li>
          <li>
            <NavLink
              to={`/admin/editions/${editionId}/decisions`}
              className={linkClass}
            >
              Decisions
            </NavLink>
          </li>
          <li>
            <NavLink
              to={`/admin/editions/${editionId}/program`}
              className={linkClass}
            >
              Program
            </NavLink>
          </li>
          <li>
            <NavLink
              to={`/admin/editions/${editionId}/book`}
              className={linkClass}
            >
              Abstract book
            </NavLink>
          </li>
        </SidebarSection>
      ) : null}

      {isReviewer ? (
        <SidebarSection title="Reviewing">
          <li>
            <NavLink to="/review" className={linkClass}>
              My review queue
            </NavLink>
          </li>
        </SidebarSection>
      ) : null}
    </nav>
  );
}

function AccountMenu({ email }: { email: string | null }) {
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        Account
      </summary>
      <div className="absolute right-0 z-40 mt-1 min-w-56 rounded-lg border border-border bg-surface-raised p-3 shadow-lg">
        {email ? (
          <p className="mb-2 truncate px-1 text-sm text-text-muted">{email}</p>
        ) : null}
        <Form method="post" action="/signout">
          <button
            type="submit"
            className="w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Sign out
          </button>
        </Form>
      </div>
    </details>
  );
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { email, isAdmin, isReviewer } = loaderData;
  const params = useParams();
  const editionId = params.editionId;
  const meetingName = useActiveMeetingName();
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const wordmark = rootData?.settings?.shortName ?? "";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <OffCanvas triggerLabel="Open admin menu" title="Admin menu" side="left">
                <AdminNav
                  isAdmin={isAdmin}
                  isReviewer={isReviewer}
                  editionId={editionId}
                />
              </OffCanvas>
            </div>
            <Link
              to="/"
              className="rounded-md px-2 py-1 text-sm font-semibold tracking-tight text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {wordmark}
            </Link>
            <span className="text-sm text-text-muted">
              {meetingName ? meetingName : "Admin"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <AccountMenu email={email} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-panel md:block">
          <AdminNav
            isAdmin={isAdmin}
            isReviewer={isReviewer}
            editionId={editionId}
          />
        </aside>
        <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
