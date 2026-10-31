import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { iconLinks } from "@drdustinedwards/site-helpers/icons";
import { LinkPrefetch } from "capsomer/react/link";
import { ErrorPage, errorTitle } from "capsomer/react/error-page";
import { cloudflareContext } from "~/load-context";
import { getDataAccess } from "~/lib/data-access";
import { readThemeCookie } from "capsomer/theme-server";
import { THEME_COOKIE } from "~/lib/theme";
import { SITE_NAME } from "~/lib/site-meta";
// Inter from txasm's own origin (Fontsource, the file Google Fonts serves, bundled under /assets/): no stylesheet
// from fonts.googleapis.com blocking the first paint, and no second origin to connect to. The variable file carries
// Inter's optical sizes, as the Google request asked for.
import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/inter/opsz-italic.css";
import "./app.css";

export const links: Route.LinksFunction = () => [
  // The starburst mark, squared: legible at tab size where the full wordmark would not.
  ...iconLinks(),
];

// An unmatched address matches only the root, so the error path's title comes from here (WCAG 2.4.2).
export function meta({ error, loaderData }: Route.MetaArgs) {
  return error ? [{ title: errorTitle(error, loaderData?.settings?.shortName || SITE_NAME) }] : [];
}

// Root provides the document, the theme, and the platform settings the shells
// render (org identity, footer links). The public and admin shells (their own
// layout routes) read these from the root loader data.
export async function loader({ request, context }: Route.LoaderArgs) {
  const theme = readThemeCookie(request, THEME_COOKIE);
  const settings = await getDataAccess(
    context.get(cloudflareContext).env,
  ).settings.get();
  // The origin this page was served from, for the share card's address (pageHead).
  return { theme, settings, origin: new URL(request.url).origin };
}

// Paths a hovered link must not prefetch (a prefetch runs the loader), beyond the family's
// NEVER_PREFETCH that capsomer/react/link already skips: sign-out here is /signout, and
// /admin/access is the one path the Cloudflare Access application covers.
const NO_PREFETCH = ["/signout", "/admin/access"];

export function Layout({ children }: { children: React.ReactNode }) {
  // data-theme is set server-side from the cookie so the SSR render matches the
  // chosen theme with no flash. When absent, prefers-color-scheme decides.
  // Capsomer's navy family and txasm's site layer (Inter) apply to the page.
  const data = useRouteLoaderData<typeof loader>("root");
  const theme = data?.theme ?? undefined;
  return (
    <html lang="en" data-theme={theme} data-family="navy" data-cap-site="txasm">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <LinkPrefetch exclude={NO_PREFETCH}>{children}</LinkPrefetch>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// The skip link is the site header's (the public and admin shells).
export default function App() {
  return <Outlet />;
}

// Capsomer's error page (404, 410, 500 in plain words, noindex, the stack only in development). The public header and
// footer read loader data the error path does not have, so they are left out, as before.
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <ErrorPage error={error} home="/" dev={import.meta.env.DEV} />;
}
