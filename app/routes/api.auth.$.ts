import type { Route } from "./+types/api.auth.$";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { authHandler } from "@dustinedwards/site-runtime/sign-in-form";
import { getAuth } from "~/lib/auth.server";

// Better Auth owns every method under /api/auth/*. Both reads (session, magic
// link verify) and writes (sign-in, sign-out) hand off to its handler, no-store
// when it says nothing (site-runtime authHandler).
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return authHandler(await getAuth(env), request);
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  return authHandler(await getAuth(env), request);
}
