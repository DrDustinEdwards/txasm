import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import * as schema from "../db/schema";
import { getDb } from "../db/index.server";

// Better Auth on D1/Drizzle. Sign-in is magic-link only (no Google): academics
// use many providers, so a link to their inbox is the lowest-friction path.
// Sessions live in KV via secondaryStorage, so there is no session table in D1.
//
// The instance is built per environment and cached, since the worker env is
// stable within an isolate. The adapter needs the schema and the Drizzle client,
// which is why this file sits inside the data/auth boundary alongside
// app/lib/data-access.ts and app/db/index.server.ts.
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
          // TODO(phase-2): send this through Resend (email.server.ts) once the
          // sending domain is verified. Resend is the chosen provider; do not
          // add another. Until then, log the link so dev sign-in is testable
          // without an email provider.
          console.log(`[auth] magic link for ${email}: ${url}`);
        },
      }),
    ],
    // Seed the first platform admin. When the user whose email matches
    // ADMIN_EMAIL is created (first sign-in), grant them a platform-wide admin
    // role. A null edition_id means the grant is not scoped to one edition.
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            const adminEmail = env.ADMIN_EMAIL?.toLowerCase();
            if (!adminEmail) return;
            if (createdUser.email.toLowerCase() !== adminEmail) return;
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
