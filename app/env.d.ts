// Secrets and vars are set with `wrangler secret`, not in wrangler.jsonc, so they
// are not generated into worker-configuration.d.ts. Declare them on both the
// global Env (what loaders, actions, and the data/auth functions take) and
// Cloudflare.Env (what `cloudflare:workers` exports as `env`), so the ambient env
// the auth helpers read stays assignable to the Env those functions expect.
// Resend and Cloudflare Email Service vars are deferred and intentionally absent.
interface Env {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ADMIN_EMAIL: string;
  // Comma-separated admin allowlist. Optional; falls back to ADMIN_EMAIL.
  ADMIN_EMAILS?: string;
  // Carrel's site API key (app/lib/carrel/handler.server.ts). Unset: the API refuses every call.
  CARREL_SITE_KEY?: string;
}

declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    ADMIN_EMAIL: string;
    ADMIN_EMAILS?: string;
    CARREL_SITE_KEY?: string;
  }
}
