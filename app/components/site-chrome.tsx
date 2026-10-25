import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { LinkProps } from "capsomer/react/site-header";
import { themeCookie } from "capsomer/theme-server";
import { THEME_COOKIE, type Theme } from "~/lib/theme";

// What the public and admin shells share around Capsomer's site header and
// AdminShell: router links, the avatar's letters, and the theme's memory.

/** Where Capsomer's theme button remembers the choice in this browser. */
export const THEME_PREF_KEY = "txasm-theme";

// /signout is a POST action and /documents serve files: a full load for both.
const DOCUMENT_HREF = /^(\/(signout|documents)(\/|$)|https?:|mailto:)/;

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

/** The avatar's letter: the email's first. */
export const initials = (email: string) => (email[0] ?? "?").toUpperCase();

/** The theme as txasm keeps it: the txasm_theme cookie, which the root loader
 *  reads so <html data-theme> is right from the first byte. Capsomer's theme
 *  button also remembers a choice in this browser, so that memory is set to the
 *  cookie's answer before the button reads it, and every switch is written
 *  back to the cookie. */
export function useThemeCookie(serverTheme: Theme | null): void {
  useState(() => {
    if (typeof window === "undefined") return null;
    try {
      if (serverTheme) localStorage.setItem(THEME_PREF_KEY, serverTheme);
      else localStorage.removeItem(THEME_PREF_KEY);
    } catch {
      // Storage blocked: the button falls back to <html data-theme>.
    }
    return null;
  });
  useEffect(() => {
    const onTheme = (e: Event) => {
      const choice = (e as CustomEvent<{ choice?: string }>).detail?.choice;
      if (choice !== "light" && choice !== "dark") return;
      document.cookie = themeCookie(choice, { name: THEME_COOKIE, secure: location.protocol === "https:" });
    };
    document.addEventListener("cap-theme", onTheme);
    return () => document.removeEventListener("cap-theme", onTheme);
  }, []);
}
