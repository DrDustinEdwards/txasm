import { accessAdmin } from "@dustinedwards/site-runtime/access";

// Platform admins sign in through Cloudflare Access, as on every family site.
// Chairs and reviewers are not: they are academics with their own accounts, and
// their pages share /admin with the admin-only ones. So the Access application
// covers one path, /admin/access (site-runtime's default), which sets Access's
// domain-wide cookie and comes back (accessSignInUrl and safeAdminNext from
// site-runtime ./access); requireAdmin (auth.server.ts) then checks that cookie on
// every admin request. With ACCESS_TEAM_DOMAIN or ACCESS_AUD unset nobody passes
// (fails closed); ACCESS_DEV_BYPASS="1" lets localhost in.

/** Whether Access signed this request for the signed-in admin's own email. */
export async function adminAccessOk(env: Env, request: Request, email: string): Promise<boolean> {
  // The one admin who may pass is the signed-in user, not the ADMIN_EMAILS list:
  // admins are granted in D1, and Access must vouch for this account in particular.
  return (await accessAdmin(request, env, { admins: email })) !== null;
}
