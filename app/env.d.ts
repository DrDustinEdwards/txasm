// Secrets and vars are set with `wrangler secret`, not in wrangler.jsonc, so they
// are not generated into worker-configuration.d.ts. Declare them here so loaders,
// actions, and the auth instance get typed access through context.cloudflare.env.
// Resend and PayPal vars are deferred (Phase 2) and intentionally absent.
interface Env {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ADMIN_EMAIL: string;
}
