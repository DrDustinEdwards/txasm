import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { redirect } from "react-router";
import { env } from "cloudflare:workers";
import { signInOptions } from "@dustinedwards/site-runtime/sign-in";
import * as schema from "../db/schema";
import { getDb } from "../db/index.server";
import {
  getActor,
  isAdmin,
  isChair,
  isReviewerAnywhere,
  type Actor,
} from "./data-access";
import { magicLinkEmail, sendEmail } from "./email.server";
import { accessSignInUrl, adminAccessOk } from "./access.server";

// Better Auth on D1/Drizzle, with the family's one sign-in (site-runtime
// ./sign-in): a passkey first, an emailed link before one exists, Turnstile on
// the link once its keys are set, no passwords. No Google or Apple: academics use
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
    // Goes through the email helper, which is dormant until cutover. While
    // dormant it logs the message (including the link), so dev sign-in is
    // unchanged; at cutover the same call sends a real email.
    sendMagicLink: async ({ email, url }) => {
      await sendEmail(env, { to: email, ...magicLinkEmail(url) });
    },
  });

  return betterAuth({
    ...signIn,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
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
    // Seed platform admins. ADMIN_EMAILS is a comma-separated allowlist; when a
    // user whose email is on it is created (first sign-in), grant them a
    // platform-wide admin role (null edition_id). Falls back to the single
    // ADMIN_EMAIL for backward compatibility when ADMIN_EMAILS is not set.
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            const source = env.ADMIN_EMAILS ?? env.ADMIN_EMAIL ?? "";
            const adminEmails = source
              .split(",")
              .map((email) => email.trim().toLowerCase())
              .filter((email) => email.length > 0);
            if (adminEmails.length === 0) return;
            if (!adminEmails.includes(createdUser.email.toLowerCase())) return;
            await db
              .insert(schema.roleGrant)
              .values({
                userId: createdUser.id,
                role: "admin",
                editionId: null,
              })
              .onConflictDoNothing();
          },
        },
      },
    },
  });
}

type AuthInstance = Awaited<ReturnType<typeof buildAuth>>;

const cache = new WeakMap<Env, Promise<AuthInstance>>();

export function getAuth(env: Env): Promise<AuthInstance> {
  const existing = cache.get(env);
  if (existing) return existing;
  const auth = buildAuth(env);
  cache.set(env, auth);
  return auth;
}

export type Auth = AuthInstance;

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
    const session = await (await getAuth(env)).api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return null;
    const { id, email, name } = session.user;
    return { id, email, name: name ?? null };
  } catch (error) {
    console.error("[auth] getSession failed", error);
    return null;
  }
}

// Redirect to sign-in when there is no session.
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw redirect("/signin");
  return user;
}

// Require a platform-wide admin role_grant. Signed-out users go to sign-in;
// signed-in non-admins get a 403; an admin without Cloudflare Access's cookie
// goes through Access first (access.server.ts).
export async function requireAdmin(request: Request): Promise<AdminContext> {
  const user = await requireUser(request);
  const actor = await getActor(env, user.id);
  if (!isAdmin(actor)) {
    throw new Response("Forbidden", { status: 403 });
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
  const actor = await getActor(env, user.id);
  if (!isChair(actor, editionId)) {
    throw new Response("Forbidden", { status: 403 });
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
  const actor = await getActor(env, user.id);
  return {
    user,
    isAdmin: isAdmin(actor),
    isReviewer: isReviewerAnywhere(actor),
  };
}
