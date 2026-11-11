// Everything a page that does not hydrate does in the browser, without React, bundled into /site.js by devkit's
// siteScript (vite.config.ts). root.tsx loads it on every page whose routes do not ask to hydrate (`handle =
// { hydrate: true }`). Each part wires the markup the server already rendered, the same markup the React components
// wire on a hydrating page, and does nothing on a page without it. What only some pages use is an island
// (app/islands/), which startIslands loads only where an element names it with data-island.
import { startIslands } from "@dustinedwards/devkit/islands";
import { enhance as enhanceHeader } from "capsomer/behavior/site-header";
import { enhance as enhanceTabs } from "capsomer/behavior/tabs";
import { enhance as enhanceTheme } from "capsomer/behavior/theme-switch";

// The header is rendered with hydrate={false} (public.layout.tsx), so it is left for these to wire: the theme
// button carries its key and the txasm_theme cookie (data-cap-pref, data-cap-cookie) and starts from the theme the
// server wrote; Sign out is a form that posts to /signout.
enhanceTheme();
enhanceHeader();
// The past officers' tabs (branch-officers.tsx): arrow keys, Home and End, activation follows focus.
enhanceTabs();
startIslands();
