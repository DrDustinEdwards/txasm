import { redirect } from "react-router";
import type { Route } from "./+types/signout";
import { cloudflareContext } from "~/load-context";
import { getAuth } from "~/lib/auth.server";

// A stray GET (or a click without JS landing here) just goes home.
export async function loader() {
  return redirect("/");
}

// Sign out ends the session and returns home. Better Auth's /sign-out answers with the
// cookie-clearing Set-Cookie and, from site-runtime's sign-out hook, Clear-Site-Data, so
// the browser drops this site's cookies, storage and cache too; both go onto the redirect.
export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const response = await (await getAuth(env)).api.signOut({
    headers: request.headers,
    asResponse: true,
  });

  const headers = new Headers(response.headers);
  headers.delete("Content-Type");
  headers.delete("Content-Length");
  return redirect("/", { headers });
}
