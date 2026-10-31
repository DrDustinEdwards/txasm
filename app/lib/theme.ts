// The theme cookie's name and type. Capsomer's theme-server reads and writes it (readThemeCookie in the root loader,
// themeCookie when the switch changes), so this file only names the site's own cookie, which visitors already carry.
export type { ThemeChoice as Theme } from "capsomer/theme-server";

export const THEME_COOKIE = "txasm_theme";

/** Where Capsomer's theme button remembers the choice in this browser. */
export const THEME_PREF_KEY = "txasm-theme";
