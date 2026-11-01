import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { redirect } from "react-router";
import { env, waitUntil } from "cloudflare:workers";
import { accessSignInUrl } from "@dustinedwards/site-runtime/access";
import { OWASP_EVENTS, logEvent, requestFields } from "@dustinedwards/site-runtime/log";
import { emailConfirmURL, signInOptions } from "@dustinedwards/site-runtime/sign-in";
import * as schema from "../db/schema";
import { getDb } from "../db/index.server";
import {
  getActor,
  getDataAccess,
  isAdmin,
  isChair,
  isReviewerAnywhere,
  type Actor,
} from "./data-access";
import { emailChangeEmail, magicLinkEmail, securityNoticeEmail, sendEmail } from "./email.server";
import { EMAIL_CONFIRM_PATH, SIGN_IN_CONFIRM_PATH } from "./site-meta";
import { adminAccessOk } from "./access.server";

// Better Auth on D1/Drizzle, with the family's one sign-in (site-runtime
// ./sign-in): a passkey first, an emailed link before one exists, Turnstile on
// the link (it fails closed without its keys), no passwords. No Google or Apple: academics use
// many providers, so the inbox is the way in. Sessions and the sign-in rate
// limit are in D1 (app/db/schema.ts).
//
// The instance is built once per environment and the promise kept, since the
// worker env is stable within an isolate. The adapter needs the schema and the
// Drizzle client, which is why this file sits inside the data/auth boundary
// alongside the data-access layer and app/db/index.server.ts.
async function buildAuth(env: Env) {
  const db = getDb(env);
  const signIn = await signInOptions(env, {
    siteName: "TXASM",
    // The link and its code in one mail (magicLinkEmail). Goes through the email
    // helper, which is dormant until cutover: while dormant it sends nothing and
    // logs neither; at cutover the same call sends a real email, and a send
    // error has the link and code cut out.
    sendMagicLink: async ({ email, url, token, code }) => {
      await sendEmail(env, { to: email, ...magicLinkEmail(email, url, code) }, { secrets: [url, token, code] });
    },
    // The link opens /signin/confirm, under /signin, so it is private and never stored (site-meta.ts).
    confirmPath: SIGN_IN_CONFIRM_PATH,
    // Five sign-in mails an hour and ten typed codes a day per address.
    emailLimiter: env.RATE_LIMITER,
    // Each auth event is also a row in auth_events (migration 0030): the person's history on /account,
    // /health's spike check, pruned daily (workers/app.ts).
    eventsDb: env.DB,
    // Each session's last use and coarse place, written when it is read (at most every five minutes), and a device
    // id cookie for the new-device notice (migrations 0029 and 0031; site-runtime ./sign-in, sessionDetails).
    sessionDetails: true,
    // A mail to the account's address for each change to how it signs in: a passkey added or removed,
    // other devices signed out (site-runtime ./sign-in, sendSecurityNotice). Dormant with the rest of the mail.
    sendSecurityNotice: async (_kind, { user, detail }) => {
      await sendEmail(env, { to: user.email, ...securityNoticeEmail(user.email, detail, new URL("/account", env.BETTER_AUTH_URL).href) });
    },
  });

  // Better Auth's /verify-email link acts on a GET, so a mail scanner would confirm for the
  // person. Both mails carry the site's own page instead (EMAIL_CONFIRM_PATH), whose button posts.
  const emailConfirmUrl = (url: string) => emailConfirmURL(url, EMAIL_CONFIRM_PATH);

  return betterAuth({
    ...signIn,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Only the email change mails a verification link; nothing mails one on request.
    disabledPaths: [...signIn.disabledPaths, "/send-verification-email"],
    user: {
      // An email change is confirmed from the current address first, then from the new one;
      // the change is made on the second, and site-runtime's notice goes to both addresses.
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url, token }) => {
          const link = emailConfirmUrl(url);
          await sendEmail(env, { to: user.email, ...emailChangeEmail(user.email, link, "current", newEmail, EMAIL_CHANGE_EXPIRES_IN_WORDS) }, { secrets: [link, token] });
        },
      },
      // Self-service deletion from /account. Better Auth asks for a sign-in in the last
      // FRESH_SECONDS and removes the sessions, linked accounts and (by cascade) passkeys.
      // What the person put into a Meeting stays: handOverRecords gives those rows to a
      // "Deleted account" user first (data-access/account.ts). An active admin, chair or
      // reviewer grant is handed over before deleting.
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          const account = getDataAccess(env).account;
          if ((await account.deletionBlockers(user.id)).length > 0) {
            throw new APIError("BAD_REQUEST", { code: "ACCOUNT_HAS_ROLE", message: "The account holds a role in a Meeting." });
          }
          await account.handOverRecords(user.id);
        },
      },
    },
    emailVerification: {
      expiresIn: EMAIL_CHANGE_EXPIRES_IN_SECONDS,
      // The second step of an email change: the link to the new address (user.email is it here).
      sendVerificationEmail: async ({ user, url, token }) => {
        const link = emailConfirmUrl(url);
        await sendEmail(env, { to: user.email, ...emailChangeEmail(user.email, link, "new", undefined, EMAIL_CHANGE_EXPIRES_IN_WORDS) }, { secrets: [link, token] });
      },
    },
    // A notice is mailed after the answer, not before it. The instance is kept per isolate, so it
    // has no request's ctx; cloudflare:workers' waitUntil is the same call for the current request.
    advanced: { ...signIn.advanced, backgroundTasks: { handler: (promise) => waitUntil(promise) } },
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        account: schema.account,
        verification: schema.verification,
        session: schema.session,
        rateLimit: schema.rateLimit,
        passkey: schema.passkey,
      },
    }),
  });
}

// How long each email-change link works: an hour, Better Auth's default, said in the mail.
export const EMAIL_CHANGE_EXPIRES_IN_SECONDS = 60 * 60;
const EMAIL_CHANGE_EXPIRES_IN_WORDS = "1 hour";

type AuthInstance = Awaited<ReturnType<typeof buildAuth>>;

const cache = new WeakMap<Env, Promise<AuthInstance>>();

export function getAuth(env: Env): Promise<AuthInstance> {
  const existing = cache.get(env);
  if (existing) return existing;
  const auth = buildAuth(env);
  cache.set(env, auth);
  return auth;
}

// ---------------------------------------------------------------------------
// Request helpers. These read env from the Cloudflare-native module so callers
// pass only the request. They stay inside the data/auth boundary: admin status
// is resolved through getActor in the data-access layer, never raw queries.
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AdminContext {
  user: SessionUser;
  actor: Actor;
}

export interface UserContext {
  user: SessionUser | null;
  isAdmin: boolean;
  isReviewer: boolean;
}

export interface ChairContext {
  user: SessionUser;
  actor: Actor;
}

// Non-throwing session read. Returns null when signed out, and also when auth is
// not configured yet (no secret) so public pages still render before cutover.
export async function getSessionUser(
  request: Request,
): Promise<SessionUser | null> {
  if (!env.BETTER_AUTH_SECRET) return null;
  try {
    // With the request, so the session's last use and place move with it (sessionDetails above).
    // asResponse: false, since Better Auth answers a call that carries a request with a Response,
    // which has no user, unless told not to.
    const session = await (await getAuth(env)).api.getSession({
      headers: request.headers,
      request,
      asResponse: false,
    });
    if (!session?.user) return null;
    const { id, email, name } = session.user;
    return { id, email, name: name ?? null };
  } catch (error) {
    console.error("[auth] getSession failed", error);
    return null;
  }
}

// The 403 for a signed-in user without the grant a page needs, logged as OWASP `authz_fail` with what was missing
// (never who asked: the line carries the request's path and id only).
export function forbidden(request: Request, need: string): Response {
  logEvent(OWASP_EVENTS.authorizationFailure, { ...requestFields(request, { status: 403 }), need }, { level: "warn" });
  return new Response("Forbidden", { status: 403 });
}

// Redirect to sign-in when there is no session.
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw redirect("/signin");
  return user;
}

// Require a platform admin: an address on ADMIN_EMAILS, read on every request
// (getActor), so someone taken off the list stops being admin at once. Signed-out
// users go to sign-in; signed-in non-admins get a 403; an admin without
// Cloudflare Access's cookie goes through Access first (access.server.ts).
export async function requireAdmin(request: Request): Promise<AdminContext> {
  const user = await requireUser(request);
  const actor = await getActor(env, user);
  if (!isAdmin(actor)) {
    throw forbidden(request, "admin");
  }
  await requireAdminAccess(request, user);
  return { user, actor };
}

async function requireAdminAccess(request: Request, user: SessionUser) {
  if (!(await adminAccessOk(env, request, user.email))) throw redirect(accessSignInUrl(request));
}

// Require a chair (or admin) of a specific meeting. Signed-out users go to
// sign-in; signed-in users without the grant get a 403. isChair already treats a
// platform admin as a chair of every meeting.
export async function requireChair(
  request: Request,
  editionId: string,
): Promise<ChairContext> {
  const user = await requireUser(request);
  const actor = await getActor(env, user);
  if (!isChair(actor, editionId)) {
    throw forbidden(request, "chair");
  }
  // A platform admin is a chair of every meeting, and an admin always comes
  // through Access.
  if (isAdmin(actor)) await requireAdminAccess(request, user);
  return { user, actor };
}

// For chrome that adapts to auth state (the header). Never throws.
export async function getUserContext(request: Request): Promise<UserContext> {
  const user = await getSessionUser(request);
  if (!user) return { user: null, isAdmin: false, isReviewer: false };
  const actor = await getActor(env, user);
  return {
    user,
    isAdmin: isAdmin(actor),
    isReviewer: isReviewerAnywhere(actor),
  };
}
