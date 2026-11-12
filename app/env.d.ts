// Secrets and vars are set with `wrangler secret`, not in wrangler.jsonc, so they are not generated into
// worker-configuration.d.ts. The ones every site reads through site-runtime (maintenance, the admin roster and Access,
// the admin idle secret, the operator token, Carrel's key, the Anthropic key, Turnstile) are its SiteSecrets; txasm's
// own are below. Declared on both the global Env (what loaders, actions, and the data/auth functions take) and
// Cloudflare.Env (what `cloudflare:workers` exports as `env`), so the ambient env the auth helpers read stays
// assignable to the Env those functions expect.
// Resend and Cloudflare Email Service vars are deferred and intentionally absent.
type SiteSecrets = import("@dustinedwards/site-runtime/worker").SiteSecrets;

interface TxasmSecrets extends SiteSecrets {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

interface Env extends TxasmSecrets {}

declare namespace Cloudflare {
  interface Env extends TxasmSecrets {}
}
