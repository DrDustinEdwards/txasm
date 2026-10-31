// The header set every txasm response carries: the family registry's entry (site-runtime ./sites: the passkey
// sign-in's Permissions-Policy) plus Prelum's TDMRep header, which reserves training rights as /ai.txt says. The
// Worker applies it (security-headers.ts) and scripts/gen-headers.mjs writes it into public/_headers for the static
// files. Package imports only: that script loads this file under plain Node.
import { TDM_RESERVATION_HEADERS } from "@drdustinedwards/site-helpers/robots";
import { buildSecurityHeaders } from "@dustinedwards/site-runtime/headers";
import { txasm } from "@dustinedwards/site-runtime/sites";

export const SECURITY_HEADERS: Record<string, string> = {
  ...buildSecurityHeaders({ site: txasm }),
  ...TDM_RESERVATION_HEADERS,
};
