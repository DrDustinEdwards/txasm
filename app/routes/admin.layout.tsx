import { Icon, type IconName } from "capsomer/react/icons";
import { routerRenderLink } from "capsomer/react/link";
import {
  Outlet,
  useLocation,
  useMatches,
  useParams,
  useRouteLoaderData,
  useSubmit,
} from "react-router";
import { AdminShell, type AdminEntry } from "capsomer/react/admin-shell";
import type { Route } from "./+types/admin.layout";
import type { loader as rootLoader } from "~/root";
import { getUserContext } from "~/lib/auth.server";
import { BrandMark } from "~/lib/brand";
import { initials, THEME_PREF_KEY, useThemeCookie } from "~/components/site-chrome";

// The admin and chair areas are apps: every route under this layout hydrates (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

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
    const data = match.loaderData as MatchData | undefined;
    if (data?.edition?.name) return data.edition.name;
  }
  return null;
}

type Entry = AdminEntry & { end?: boolean };

// Menu glyphs: Capsomer's icon set, drawn at the menu's own size (.cap-admin-icon).
const ICONS = {
  meetings: "calendar",
  add: "add",
  award: "award",
  people: "people",
  document: "document",
  settings: "settings",
  overview: "overview",
  ticket: "ticket",
  tag: "tag",
  roles: "roles",
  assign: "assign",
  decide: "decide",
  program: "clock",
  book: "book",
  queue: "queue",
} as const satisfies Record<string, IconName>;

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
  const e = (
    group: string,
    label: string,
    href: string,
    icon: keyof typeof ICONS,
    end = false,
  ): Entry => ({
    id: href,
    group,
    label,
    href,
    icon: <Icon name={ICONS[icon]} className="cap-admin-icon" />,
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
      logo={{
        href: "/",
        label: `${wordmark} admin`,
        mark: <BrandMark className="txasm-mark" />,
        wordmark: <span aria-hidden="true">Admin</span>,
      }}
      status={meetingName ? <span className="txasm-meeting">{meetingName}</span> : undefined}
      themePrefKey={THEME_PREF_KEY}
      renderLink={routerRenderLink}
      viewSite="/"
      account={
        email
          ? {
              name: email,
              initials: initials(email),
              onSignOut: () => void submit(null, { method: "post", action: "/signout" }),
            }
          : undefined
      }
    >
      <div className="cap-admin-page">
        <Outlet />
      </div>
    </AdminShell>
  );
}
