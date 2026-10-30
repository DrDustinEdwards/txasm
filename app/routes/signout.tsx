import { LOGOUT_HEADERS } from "@dustinedwards/site-runtime/headers";
import { redirect } from "react-router";
import type { Route } from "./+types/signout";
import { cloudflareContext } from "~/load-context";
import { getAuth } from "~/lib/auth.server";

// A stray GET (or a click without JS landing here) just goes home.
export async function loader() {
  return redirect("/");
}

// Sign out clears the session in KV and the session cookie, then returns home.
// The cookie-clearing headers from Better Auth are forwarded onto the redirect, with
// site-runtime's LOGOUT_HEADERS (Clear-Site-Data), so the browser drops this site's
// cookies, storage and cache too.
export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const response = await (await getAuth(env)).api.signOut({
    headers: request.headers,
    asResponse: true,
  });

  const headers = new Headers(LOGOUT_HEADERS);
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("Set-Cookie", cookie);
  }
  return redirect("/", { headers });
}
