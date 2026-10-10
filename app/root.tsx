import "./does-not-exist.css";
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
import { cloudflareContext } from "~/load-context";
import { BRAND } from "~/lib/brand";
import { getDataAccess } from "~/lib/data-access";
import { parseThemeCookie } from "~/lib/theme";
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
  const theme = parseThemeCookie(request.headers.get("Cookie"));
  const settings = await getDataAccess(
    context.get(cloudflareContext).env,
  ).settings.get();
  return { theme, settings };
}

export function Layout({ children }: { children: React.ReactNode }) {
  // data-theme is set server-side from the cookie so the SSR render matches the
  // chosen theme with no flash. When absent, prefers-color-scheme decides.
  const data = useRouteLoaderData<typeof loader>("root");
  const theme = data?.theme ?? undefined;
  return (
    <html lang="en" data-theme={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-surface text-text antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-text focus:shadow"
      >
        Skip to content
      </a>
      <Outlet />
    </>
  );
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
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-16">
      <h1 className="text-2xl font-semibold text-text">{heading}</h1>
      <p className="mt-3 text-text-muted">{detail}</p>
      {import.meta.env.DEV && error instanceof Error && error.stack ? (
        <pre className="mt-6 overflow-x-auto rounded bg-panel p-4 text-sm text-text">
          <code>{error.stack}</code>
        </pre>
      ) : null}
    </main>
  );
}
