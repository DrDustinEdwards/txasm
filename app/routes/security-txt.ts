// /.well-known/security.txt (RFC 9116), from site-runtime: where to report a vulnerability. Canonical is the host
// that answered, so it holds on workers.dev now and on txasm.org after the cutover.
import { securityTxtResponse } from "@dustinedwards/site-runtime/security-txt";
import { SECURITY_CONTACT, SECURITY_TXT_EXPIRES } from "~/lib/site-meta";
import type { Route } from "./+types/security-txt";

export function loader({ request }: Route.LoaderArgs) {
  return securityTxtResponse({ origin: new URL(request.url).origin, contact: SECURITY_CONTACT, expires: SECURITY_TXT_EXPIRES });
}
