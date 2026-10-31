// The header set every txasm response carries: the family registry's entry (site-runtime ./sites: the passkey
// sign-in's Permissions-Policy, COEP and Integrity-Policy, both Report-Only) plus Prelum's TDMRep header, which reserves
// training rights as /ai.txt says. The Worker applies it (security-headers.ts); site-runtime-headers writes the same
// entry and header into public/_headers for the static files (npm run headers).
import { TDM_RESERVATION_HEADERS } from "@drdustinedwards/site-helpers/robots";
import { buildSecurityHeaders } from "@dustinedwards/site-runtime/headers";
import { txasm } from "@dustinedwards/site-runtime/sites";

export const SECURITY_HEADERS: Record<string, string> = {
  ...buildSecurityHeaders({ site: txasm }),
  ...TDM_RESERVATION_HEADERS,
};
