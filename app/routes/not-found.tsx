import { ErrorPage, errorTitle } from "capsomer/react/error-page";
import { goneResponse } from "@dustinedwards/site-runtime/url";
import { GONE, SITE_NAME } from "~/lib/site-meta";
import type { Route } from "./+types/not-found";

// Every path no route matches: a 410 for a path on GONE, else a 404. It sits in the public layout, so its
// ErrorBoundary draws Capsomer's error page between the layout's header and footer, and the page keeps its landmarks.
export function loader({ request }: Route.LoaderArgs): never {
  throw goneResponse(request, GONE) ?? new Response("Not Found", { status: 404 });
}

// The error path's title (WCAG 2.4.2).
export function meta({ error }: Route.MetaArgs) {
  return error ? [{ title: errorTitle(error, SITE_NAME) }] : [];
}

export default function NotFound() {
  return null;
}

// The layout's own main wraps this, so the page is a div: one main.
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <ErrorPage error={error} home="/" as="div" dev={import.meta.env.DEV} />;
}
