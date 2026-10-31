import { applyHeaderSet, UPLOAD_HEADERS } from "@dustinedwards/site-runtime/headers";
import { linkIconResponse } from "@drdustinedwards/site-helpers/render/link-icons";
import type { Route } from "./+types/link-icons.$";
import { linkIconStore } from "~/lib/link-icons.server";
import { cloudflareContext } from "~/load-context";

// The icons of the outside sites a page links to, stored at publish (app/lib/link-icons.server.ts).
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const response = await linkIconResponse(new URL(request.url).pathname, linkIconStore(env));
  if (!response) throw new Response("Not found", { status: 404 });
  const headers = new Headers(response.headers);
  applyHeaderSet(headers, UPLOAD_HEADERS);
  return new Response(response.body, { status: response.status, headers });
}
