// Theme helpers shared by the server (reads the cookie in the root loader) and
// the client (the toggle writes it). No server-only imports, so this is safe on
// both sides of the boundary.

export type Theme = "light" | "dark";

export const THEME_COOKIE = "txasm_theme";
export const THEME_MAX_AGE = 60 * 60 * 24 * 365; // one year

// Pull the persisted theme out of a raw Cookie header. Returns null when there
// is no explicit choice, so the render falls back to prefers-color-scheme.
export function parseThemeCookie(cookieHeader: string | null): Theme | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === THEME_COOKIE && (value === "light" || value === "dark")) {
      return value;
    }
  }
  return null;
}
