import type { Route } from "./+types/api.auth.$";
import { cloudflareContext } from "~/load-context";
import { getAuth } from "~/lib/auth.server";

// Better Auth owns every method under /api/auth/*. Both reads (session, magic
// link verify) and writes (sign-in, sign-out) hand off to its handler.
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return getAuth(env).handler(request);
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  return getAuth(env).handler(request);
}
