import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { LinkPrefetch } from "capsomer/react/link";
import { cloudflareContext } from "~/load-context";
import { BRAND } from "~/lib/brand";
import { getDataAccess } from "~/lib/data-access";
import { readThemeCookie } from "capsomer/theme-server";
import { THEME_COOKIE } from "~/lib/theme";
import "./app.css";

export const links: Route.LinksFunction = () => [
  // The starburst mark is the favicon; it stays legible at tab size where the
  // full wordmark would not. favicon.ico remains in public/ as a legacy fallback.
  { rel: "icon", type: "image/svg+xml", href: BRAND.favicon },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

// Root provides the document, the theme, and the platform settings the shells
// render (org identity, footer links). The public and admin shells (their own
// layout routes) read these from the root loader data.
export async function loader({ request, context }: Route.LoaderArgs) {
  const theme = readThemeCookie(request, THEME_COOKIE);
  const settings = await getDataAccess(
    context.get(cloudflareContext).env,
  ).settings.get();
  return { theme, settings };
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let heading = "Something went wrong";
  let detail = "An unexpected error occurred. Try again, or head back home.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      heading = "Page not found";
      detail = "That page does not exist. Check the address or head back home.";
    } else {
      heading = `Error ${error.status}`;
      detail = error.statusText || detail;
    }
  }

  return (
    <main id="main" className="txasm-frame txasm-main reading stack-3">
      <h1 className="page-title">{heading}</h1>
      <p className="cap-muted">{detail}</p>
      {import.meta.env.DEV && error instanceof Error && error.stack ? (
        <pre className="card small error-stack">
          <code>{error.stack}</code>
        </pre>
      ) : null}
    </main>
  );
}
