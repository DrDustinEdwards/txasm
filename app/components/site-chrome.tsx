import { useMatches } from "react-router";
import { Link } from "capsomer/react/link";
import type { LinkProps } from "capsomer/react/site-header";

// What the public and admin shells share around Capsomer's site header and AdminShell: router links and
// whether the page hydrates.

// /documents serve files: a full load.
const DOCUMENT_HREF = /^(\/documents(\/|$)|https?:|mailto:)/;

/** Capsomer's links as React Router's. */
export function renderLink({ href, children, ...rest }: LinkProps) {
  if (DOCUMENT_HREF.test(href)) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} {...rest}>
      {children}
    </Link>
  );
}

/** Hydration is opt-in by route (`handle = { hydrate: true }`). A page that does not hydrate sends no React:
 *  its header is wired by /site.js (app/site.ts) instead, so the header is told (`hydrate={false}`). */
export function useRouteHydrates(): boolean {
  return useMatches().some(
    (m) => (m.handle as { hydrate?: boolean } | undefined)?.hydrate === true,
  );
}
