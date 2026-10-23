import { Outlet, useLocation, useMatches, useParams, useRouteLoaderData, useSubmit } from "react-router";
import { AdminShell, type AdminEntry } from "capsomer/react/admin-shell";
import type { Route } from "./+types/admin.layout";
import type { loader as rootLoader } from "~/root";
import { getUserContext } from "~/lib/auth.server";
import { BrandMark } from "~/lib/brand";
import { initials, renderLink, THEME_PREF_KEY, useThemeCookie } from "~/components/site-chrome";

// Admin shell, on Capsomer's AdminShell (the user variant: txasm is not one of
// the family's own apps, so it has no strip). The shell titles the tab
// "<menu entry> · TXASM admin", the family's one convention. This layout does NOT gate; each
// wrapped route keeps its own requireAdmin or requireChair. Here we only read
// the existing user context to decide which menu entries to show, and the
// active meeting name for the page.
export async function loader({ request }: Route.LoaderArgs) {
  const { user, isAdmin, isReviewer } = await getUserContext(request);
  return { email: user?.email ?? null, isAdmin, isReviewer };
}

interface MatchData {
  edition?: { name?: string };
}

// The active meeting name comes from whichever matched admin route already loads
// an edition, so the page reflects context without a new query.
function useActiveMeetingName(): string | null {
  const matches = useMatches();
  for (const match of matches) {
    const data = (match as { data?: MatchData }).data;
    if (data?.edition?.name) return data.edition.name;
  }
  return null;
}

type Entry = AdminEntry & { end?: boolean };

// The menu, grouped. Entries are shown by what the user already has: admins see
// meeting config, a selected meeting shows its chair tools, reviewers see their
// queue.
function adminNav(isAdmin: boolean, isReviewer: boolean, editionId?: string): Entry[] {
  const e = (group: string, label: string, href: string, end = false): Entry => ({ id: href, group, label, href, end });
  const meeting = `/admin/editions/${editionId}`;
  return [
    ...(isAdmin
      ? [
          e("Meetings", "All meetings", "/admin", true),
          e("Meetings", "New meeting", "/admin/editions/new"),
          e("Platform", "Awards", "/admin/awards"),
          e("Platform", "Branch officers", "/admin/officers"),
          e("Platform", "Documents", "/admin/documents"),
          e("Platform", "Settings", "/admin/settings"),
        ]
      : []),
    ...(editionId
      ? [
          e("This meeting", "Overview", meeting, true),
          e("This meeting", "Registration categories", `${meeting}/categories`),
          e("This meeting", "Abstract categories", `${meeting}/abstract-categories`),
          e("This meeting", "Chairs and reviewers", `${meeting}/roles`),
          e("This meeting", "Assign reviewers", `${meeting}/review`),
          e("This meeting", "Decisions", `${meeting}/decisions`),
          e("This meeting", "Program", `${meeting}/program`),
          e("This meeting", "Abstract book", `${meeting}/book`),
        ]
      : []),
    ...(isReviewer ? [e("Reviewing", "My review queue", "/review")] : []),
  ];
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { email, isAdmin, isReviewer } = loaderData;
  const { editionId } = useParams();
  const { pathname } = useLocation();
  const submit = useSubmit();
  const meetingName = useActiveMeetingName();
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const wordmark = rootData?.settings?.shortName || "TXASM";
  useThemeCookie(rootData?.theme ?? null);
  const nav = adminNav(isAdmin, isReviewer, editionId).map(({ end, ...entry }) => ({
    ...entry,
    current: pathname === entry.href || (!end && pathname.startsWith(`${entry.href}/`)),
  }));

  return (
    <AdminShell
      variant="user"
      title={`${wordmark} admin`}
      page={nav.find((n) => n.current)?.label}
      nav={nav}
      navLabel="Admin"
      prefKey="txasm-admin"
      logo={{ href: "/", label: `${wordmark} admin`, mark: <BrandMark className="txasm-mark" />, wordmark: <span aria-hidden="true">Admin</span> }}
      status={meetingName ? <span className="txasm-meeting">{meetingName}</span> : undefined}
      themePrefKey={THEME_PREF_KEY}
      renderLink={renderLink}
      viewSite="/"
      account={
        email
          ? { name: email, initials: initials(email), onSignOut: () => void submit(null, { method: "post", action: "/signout" }) }
          : undefined
      }
    >
      <div className="cap-admin-page">
        <Outlet />
      </div>
    </AdminShell>
  );
}
