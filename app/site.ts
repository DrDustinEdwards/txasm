// Everything a page that does not hydrate does in the browser, without React, bundled into /site.js by devkit's
// siteScript (vite.config.ts). root.tsx loads it on every page whose routes do not ask to hydrate (`handle =
// { hydrate: true }`). Each part wires the markup the server already rendered, the same markup the React components
// wire on a hydrating page, and does nothing on a page without it. What only some pages use is an island
// (app/islands/), which startIslands loads only where an element names it with data-island.
import { startIslands } from "@dustinedwards/devkit/islands";
import { enhance as enhanceHeader } from "capsomer/behavior/site-header";
import { enhance as enhanceTabs } from "capsomer/behavior/tabs";
import { enhance as enhanceTheme } from "capsomer/behavior/theme-switch";
import { themeCookie } from "capsomer/theme-server";
// Relative, not ~/: siteScript bundles this file on its own, without the app's Vite config.
import { THEME_COOKIE, THEME_PREF_KEY } from "./lib/theme";

// The theme, as useThemeCookie (app/components/site-chrome.tsx) keeps it on a hydrating page: the txasm_theme cookie
// is the memory, and the server wrote its answer into <html data-theme>. The button's own memory in this browser is
// set to that answer before the button reads it, and every switch is written back to the cookie.
function startTheme() {
  const served = document.documentElement.dataset.theme;
  try {
    if (served === "light" || served === "dark") localStorage.setItem(THEME_PREF_KEY, served);
    else localStorage.removeItem(THEME_PREF_KEY);
  } catch {
    // Storage blocked: the button falls back to <html data-theme>.
  }
  document.addEventListener("cap-theme", (e) => {
    const choice = (e as CustomEvent<{ choice?: string }>).detail?.choice;
    if (choice !== "light" && choice !== "dark") return;
    document.cookie = themeCookie(choice, { name: THEME_COOKIE, secure: location.protocol === "https:" });
  });
  // React's ThemeButton renders itself as already wired and keeps its key in a prop, so the behavior module is told
  // both here: the button is not wired yet, and the key it remembers the choice under.
  for (const button of document.querySelectorAll<HTMLElement>("[data-cap='theme-switch'][data-variant='button']")) {
    delete button.dataset.capReady;
    button.dataset.capPref = THEME_PREF_KEY;
  }
  enhanceTheme();
}

// Sign out is a POST to /signout (its action ends the session; a GET only goes home). The header's two Sign out
// buttons, in the account panel and the phone sheet, post it as a form, as the hydrated header's useSubmit does.
function wireSignOut(header: HTMLElement) {
  const SIGN_OUT = ".cap-site-header-account [data-panel-close], .cap-site-header-sheet-account button";
  header.addEventListener("click", (e) => {
    const button = (e.target as Element).closest(SIGN_OUT);
    // "Sign out" in the panel, "Sign out (<email>)" in the sheet.
    if (!button?.textContent?.trim().startsWith("Sign out")) return;
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/signout";
    form.hidden = true;
    document.body.appendChild(form);
    form.submit();
  });
}

function startHeader() {
  // Capsomer's React header marks itself wired (its components wire their own parts); here the behavior module does.
  for (const header of document.querySelectorAll<HTMLElement>("[data-cap='site-header']")) {
    delete header.dataset.capReady;
    wireSignOut(header);
  }
  enhanceHeader();
}

startTheme();
startHeader();
// The past officers' tabs (branch-officers.tsx): arrow keys, Home and End, activation follows focus.
enhanceTabs();
startIslands();
