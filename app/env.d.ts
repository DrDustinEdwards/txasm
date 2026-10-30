// Secrets and vars are set with `wrangler secret`, not in wrangler.jsonc, so they
// are not generated into worker-configuration.d.ts. Declare them on both the
// global Env (what loaders, actions, and the data/auth functions take) and
// Cloudflare.Env (what `cloudflare:workers` exports as `env`), both from one list, so the ambient env
// the auth helpers read stays assignable to the Env those functions expect.
// Resend and Cloudflare Email Service vars are deferred and intentionally absent.
interface TxasmSecrets {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ADMIN_EMAIL: string;
  // Comma-separated admin allowlist. Optional; falls back to ADMIN_EMAIL.
  ADMIN_EMAILS?: string;
  // Carrel's site API key (app/lib/carrel/handler.server.ts). Unset: the API refuses every call.
  CARREL_SITE_KEY?: string;
  // Cloudflare Turnstile on the sign-in link (app/lib/auth.server.ts). The check is on only
  // when both are set, so a key without its secret never locks everyone out.
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  // Cloudflare Access for platform admins (app/lib/access.server.ts): the team domain and the
  // application's AUD tag. Unset, no admin page opens. ACCESS_DEV_BYPASS="1" lets localhost in.
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_DEV_BYPASS?: string;
}

interface Env extends TxasmSecrets {}

declare namespace Cloudflare {
  interface Env extends TxasmSecrets {}
}
