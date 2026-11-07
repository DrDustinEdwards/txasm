import { goneResponse } from "@dustinedwards/site-runtime/url";
import { GONE } from "~/lib/site-meta";
import type { Route } from "./+types/not-found";

// Every path no route matches: a 410 for a path on GONE, else a 404, drawn by the root ErrorBoundary (Capsomer's
// ErrorPage).
export function loader({ request }: Route.LoaderArgs): never {
  throw goneResponse(request, GONE) ?? new Response("Not Found", { status: 404 });
}

export default function NotFound() {
  return null;
}
