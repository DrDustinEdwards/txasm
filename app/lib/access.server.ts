import { verifyAccessRequest } from "@dustinedwards/site-runtime/access";

// Platform admins sign in through Cloudflare Access, as on every family site.
// Chairs and reviewers are not: they are academics with their own accounts, and
// their pages share /admin with the admin-only ones. So the Access application
// covers one path, ACCESS_PATH, which sets Access's domain-wide cookie and comes
// back; requireAdmin (auth.server.ts) then checks that cookie on every admin
// request. With ACCESS_TEAM_DOMAIN or ACCESS_AUD unset nobody passes (fails
// closed); ACCESS_DEV_BYPASS="1" lets localhost in.

const ACCESS_PATH = "/admin/access";

/** Whether Access signed this request for the signed-in admin's own email. */
export async function adminAccessOk(env: Env, request: Request, email: string): Promise<boolean> {
  if (env.ACCESS_DEV_BYPASS === "1" && new URL(request.url).hostname === "localhost") return true;
  try {
    const verdict = await verifyAccessRequest(request, {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      cookie: true,
    });
    if (!verdict.ok) return false;
    const signed = verdict.claims.email;
    return typeof signed === "string" && signed.toLowerCase() === email.toLowerCase();
  } catch {
    // Access's keys could not be fetched: refuse rather than guess.
    return false;
  }
}

/** Where an admin without the cookie goes: through Access and back to `next`. */
export function accessSignInUrl(request: Request): string {
  const url = new URL(request.url);
  return `${ACCESS_PATH}?next=${encodeURIComponent(url.pathname + url.search)}`;
}

/** The page to land on after Access: an admin path on this site, else /admin. */
export function safeAdminNext(next: string | null): string {
  if (!next || !next.startsWith("/admin") || next.startsWith(ACCESS_PATH)) return "/admin";
  return next;
}
