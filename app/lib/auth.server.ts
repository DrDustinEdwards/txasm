import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { redirect } from "react-router";
import { env } from "cloudflare:workers";
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

// Better Auth on D1/Drizzle. Sign-in is magic-link only (no Google): academics
// use many providers, so a link to their inbox is the lowest-friction path.
// Sessions live in KV via secondaryStorage, so there is no session table in D1.
//
// The instance is built per environment and cached, since the worker env is
// stable within an isolate. The adapter needs the schema and the Drizzle client,
// which is why this file sits inside the data/auth boundary alongside
// the data-access layer and app/db/index.server.ts.
function buildAuth(env: Env) {
  const db = getDb(env);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    // Sessions in KV, not D1. Better Auth keeps no session table when a
    // secondary store is provided.
    secondaryStorage: {
      get: (key) => env.APP_KV.get(key),
      set: async (key, value, ttl) => {
        await env.APP_KV.put(
          key,
          value,
          ttl ? { expirationTtl: ttl } : undefined,
        );
      },
      delete: async (key) => {
        await env.APP_KV.delete(key);
      },
    },
    emailAndPassword: { enabled: false },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          // Goes through the email helper, which is dormant until cutover. While
          // dormant it logs the message (including the link), so dev sign-in is
          // unchanged; at cutover the same call sends a real email.
          await sendEmail(env, { to: email, ...magicLinkEmail(url) });
        },
      }),
    ],
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

type AuthInstance = ReturnType<typeof buildAuth>;

const cache = new WeakMap<Env, AuthInstance>();

export function getAuth(env: Env): AuthInstance {
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
    const session = await getAuth(env).api.getSession({
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
// signed-in non-admins get a 403.
export async function requireAdmin(request: Request): Promise<AdminContext> {
  const user = await requireUser(request);
  const actor = await getActor(env, user.id);
  if (!isAdmin(actor)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return { user, actor };
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
