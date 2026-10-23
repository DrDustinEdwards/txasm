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

// Menu glyphs in the family's form (Capsomer's own site and Carrel draw theirs the same way): one
// path in a 24 box, stroked by the shell's .cap-admin-icon (1.6, currentColor), so the menu, its
// collapsed column and the phone's tab bar never fall back to a letter.
function Icon({ d }: { d: string }) {
  return (
    <svg className="cap-admin-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  meetings: "M4.5 5.5h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4",
  add: "M12 5v14M5 12h14",
  award: "M12 3.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM8.8 12.4 7.5 20.5l4.5-2.5 4.5 2.5-1.3-8.1",
  people: "M9 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM2.5 19.5c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5c1.8.8 3 2.5 3.5 5",
  document: "M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h6",
  settings: "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8",
  overview: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  ticket: "M3.5 7.5h17v3a1.5 1.5 0 0 0 0 3v3h-17v-3a1.5 1.5 0 0 0 0-3zM14.5 7.5v9",
  tag: "M3.5 3.5h8l9 9-8 8-9-9zM8 7.5h.01",
  roles: "M10 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM3.5 19.5c.8-3.5 3.3-5.5 6.5-5.5 1.5 0 2.8.4 3.9 1.2M15 18l2 2 4-4",
  assign: "M8 4.5h8v3H8zM6 6H4.5v14.5h15V6H18M8.5 12.5h7M8.5 16h4",
  decide: "M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM8 12.2l2.8 2.8L16.2 9.5",
  program: "M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM12 7.5V12l3 2",
  book: "M4.5 5c2.6-1 5.2-.8 7.5.8 2.3-1.6 4.9-1.8 7.5-.8v13.5c-2.6-1-5.2-.8-7.5.8-2.3-1.6-4.9-1.8-7.5-.8zM12 5.8v13.5",
  queue: "M3.5 13.5 6 5.5h12l2.5 8v5h-17zM3.5 13.5h5l1 2h5l1-2h5",
} as const;

// The phone's bottom bar: at most four of the pages a person reaches first, under one-word
// labels so none crowds or wraps; every page stays in the header's sheet (Capsomer's admin-shell:
// "up to five ... and no More, because the menu button opens the full list").
const TAB_LABELS: Record<string, string> = {
  "All meetings": "Meetings",
  "Branch officers": "Officers",
  "My review queue": "Reviews",
};
function phoneTabs(nav: AdminEntry[], editionId?: string): AdminEntry[] {
  const meeting = `/admin/editions/${editionId}`;
  const wanted = editionId
    ? ["/admin", meeting, `${meeting}/decisions`, `${meeting}/program`, "/review"]
    : ["/admin", "/admin/awards", "/admin/officers", "/admin/documents", "/review"];
  return wanted
    .map((href) => nav.find((n) => n.href === href))
    .filter((n): n is AdminEntry => n !== undefined)
    .slice(0, 4)
    .map(({ group: _group, ...n }) => ({ ...n, label: TAB_LABELS[n.label] ?? n.label }));
}

// The menu, grouped. Entries are shown by what the user already has: admins see
// meeting config, a selected meeting shows its chair tools, reviewers see their
// queue.
function adminNav(isAdmin: boolean, isReviewer: boolean, editionId?: string): Entry[] {
  const e = (group: string, label: string, href: string, icon: keyof typeof ICONS, end = false): Entry => ({
    id: href,
    group,
    label,
    href,
    icon: <Icon d={ICONS[icon]} />,
    end,
  });
  const meeting = `/admin/editions/${editionId}`;
  return [
    ...(isAdmin
      ? [
          e("Meetings", "All meetings", "/admin", "meetings", true),
          e("Meetings", "New meeting", "/admin/editions/new", "add"),
          e("Platform", "Awards", "/admin/awards", "award"),
          e("Platform", "Branch officers", "/admin/officers", "people"),
          e("Platform", "Documents", "/admin/documents", "document"),
          e("Platform", "Settings", "/admin/settings", "settings"),
        ]
      : []),
    ...(editionId
      ? [
          e("This meeting", "Overview", meeting, "overview", true),
          e("This meeting", "Registration categories", `${meeting}/categories`, "ticket"),
          e("This meeting", "Abstract categories", `${meeting}/abstract-categories`, "tag"),
          e("This meeting", "Chairs and reviewers", `${meeting}/roles`, "roles"),
          e("This meeting", "Assign reviewers", `${meeting}/review`, "assign"),
          e("This meeting", "Decisions", `${meeting}/decisions`, "decide"),
          e("This meeting", "Program", `${meeting}/program`, "program"),
          e("This meeting", "Abstract book", `${meeting}/book`, "book"),
        ]
      : []),
    ...(isReviewer ? [e("Reviewing", "My review queue", "/review", "queue")] : []),
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
      tabs={phoneTabs(nav, editionId)}
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
