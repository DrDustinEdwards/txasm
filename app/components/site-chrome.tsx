import { useMatches } from "react-router";

// What the public and admin shells share around Capsomer's site header and AdminShell: whether the page hydrates.

/** Hydration is opt-in by route (`handle = { hydrate: true }`). A page that does not hydrate sends no React:
 *  its header is wired by /site.js (app/site.ts) instead, so the header is told (`hydrate={false}`). */
export function useRouteHydrates(): boolean {
  return useMatches().some(
    (m) => (m.handle as { hydrate?: boolean } | undefined)?.hydrate === true,
  );
}
