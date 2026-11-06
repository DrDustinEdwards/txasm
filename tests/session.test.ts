import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { Miniflare } from "miniflare";
import { applyMigrations } from "./d1";

// getSessionUser against real Better Auth and real D1. A signed-in GET once read as signed out on every page
// (round 3 of the sign-in check, 2026-11-01): given the request, Better Auth answers with a Response unless the call
// says asResponse: false, and a Response has no user. site-runtime sessionLookup always says it.
//
// auth.server.ts reads env from cloudflare:workers, which Node cannot load, so the test serves that module itself.
const workerEnv: Record<string, unknown> = {};
(globalThis as { __txasmTestEnv?: unknown }).__txasmTestEnv = workerEnv;
registerHooks({
  resolve: (specifier, context, next) =>
    specifier === "cloudflare:workers"
      ? { url: "txasm-test:cloudflare-workers", shortCircuit: true }
      : next(specifier, context),
  load: (url, context, next) =>
    url === "txasm-test:cloudflare-workers"
      ? {
          format: "module",
          source:
            "export const env = globalThis.__txasmTestEnv; export const waitUntil = (promise) => promise;",
          shortCircuit: true,
        }
      : next(url, context),
});

let mf: Miniflare;
let cookie: string;
let getSessionUser: typeof import("../app/lib/auth.server").getSessionUser;

before(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  await applyMigrations(db);
  Object.assign(workerEnv, {
    DB: db,
    BETTER_AUTH_URL: "https://example.com",
    BETTER_AUTH_SECRET: "test-secret-for-the-session-read-0123456789",
  });
  const auth = await import("../app/lib/auth.server");
  getSessionUser = auth.getSessionUser;

  // A signed-in reader: their user and session rows, and the signed cookie a sign-in would have set.
  const ctx = await (await auth.getAuth(workerEnv as unknown as Env)).$context;
  const user = await ctx.internalAdapter.createUser({
    email: "reader@example.com",
    name: "Sample Reader",
    emailVerified: true,
  });
  const session = await ctx.internalAdapter.createSession(user.id);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ctx.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(session.token)),
      ),
    ),
  );
  cookie = `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;
});

after(async () => {
  await mf?.dispose();
});

test("a signed-in GET finds the reader", async () => {
  const page = new Request("https://example.com/account", { headers: { cookie } });
  assert.equal((await getSessionUser(page))?.email, "reader@example.com");
});
