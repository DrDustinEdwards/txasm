// Secrets and vars are set with `wrangler secret`, not in wrangler.jsonc, so they
// are not generated into worker-configuration.d.ts. Declare them on both the
// global Env (what loaders, actions, and the data/auth functions take) and
// Cloudflare.Env (what `cloudflare:workers` exports as `env`), both from one list, so the ambient env
// the auth helpers read stays assignable to the Env those functions expect.
// Resend and Cloudflare Email Service vars are deferred and intentionally absent.
interface TxasmSecrets {
  /** "1" or "true" puts the site in maintenance: every path but /health answers the 503 page (site-runtime ./maintenance). Set in the dashboard. */
  MAINTENANCE?: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  // The main admin; with CO_OWNER_EMAILS the whole admin roster (site-runtime ./access). Unset: nobody is admin.
  ADMIN_EMAIL: string;
  // Co-owners, comma-separated: full use, no say over who is admin. Optional.
  CO_OWNER_EMAILS?: string;
  // Carrel's site API key (app/lib/carrel/handler.server.ts). Unset: the API refuses every call.
  CARREL_SITE_KEY?: string;
  // The Anthropic key for the library's suggested tags and alt text (Claude Haiku 5.5, straight at Anthropic). Unset: no suggestions.
  ANTHROPIC_API_KEY?: string;
  // The bearer for the operator API (/api/operator, site-runtime ./operator): Capsid Admin's backups and run_job. The same value is Capsid's TXASM_OPERATOR_TOKEN. Unset, the route answers 503.
  OPERATOR_TOKEN?: string;
  // Keys site-runtime's admin idle cookie (withAdminIdle `secret`). Minted by the deploy (devkit worker-deploy `generated-secrets`), never shown; unset, the admin paths fail (site-runtime 0.82 requires it).
  ADMIN_IDLE_SECRET: string;
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
