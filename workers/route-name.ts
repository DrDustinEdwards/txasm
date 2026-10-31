import { matchRoutes, type RouteObject, type ServerBuild } from "react-router";

// The matched route's pattern ("/awards/:slug"), for withRequestLog's `route` (site-runtime ./log), so a route's hits
// group under one name in the logs instead of one per address. Read from the server build's route manifest, which
// `ready` loads inside the request (a promise left over from a finished request never settles in workerd); a path no
// route matches, or a build that failed to load, is named by none.
function treeOf(routes: ServerBuild["routes"], parentId?: string): RouteObject[] {
  return Object.values(routes).flatMap((route): RouteObject[] => {
    if (!route || route.parentId !== parentId) return [];
    if (route.index) return [{ id: route.id, path: route.path, index: true }];
    return [{ id: route.id, path: route.path, caseSensitive: route.caseSensitive, children: treeOf(routes, route.id) }];
  });
}

export function routeNamer(load: () => Promise<ServerBuild>) {
  let tree: RouteObject[] | undefined;
  return {
    /** Loads the route tree once per isolate; never rejects. Await it beside the handler. */
    ready: async (): Promise<void> => {
      if (tree) return;
      try {
        tree = treeOf((await load()).routes);
      } catch {
        // Unnamed lines for this request; the next one tries again.
      }
    },
    name: (request: Request): string | undefined => {
      const matches = tree && matchRoutes(tree, new URL(request.url).pathname);
      return matches ? `/${matches.map((m) => m.route.path).filter(Boolean).join("/")}` : undefined;
    },
  };
}
