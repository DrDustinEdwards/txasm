import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
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

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-white text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded px-2 py-1 text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2",
    isActive ? "text-blue-800 dark:text-blue-300" : "text-gray-700 dark:text-gray-300",
  ].join(" ");

function SiteHeader() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
        <NavLink to="/" className="text-base font-semibold">
          Texas Branch ASM
        </NavLink>
        <nav aria-label="Primary" className="flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/officers" className={navLinkClass}>
            Officers
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800">
      <div className="mx-auto max-w-4xl px-4 py-6 text-sm text-gray-600 dark:text-gray-400">
        Texas Branch of the American Society for Microbiology
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow dark:focus:bg-gray-900"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
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
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-16">
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <p className="mt-3 text-gray-700 dark:text-gray-300">{detail}</p>
      {import.meta.env.DEV && error instanceof Error && error.stack ? (
        <pre className="mt-6 overflow-x-auto rounded bg-gray-100 p-4 text-sm dark:bg-gray-900">
          <code>{error.stack}</code>
        </pre>
      ) : null}
    </main>
  );
}
