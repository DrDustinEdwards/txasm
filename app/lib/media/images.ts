// The media library's addresses and responsive sizes. A library file's key is its R2 key in the
// UPLOADS bucket, always under media/, and its address is that key as a path (/media/...), served
// by app/routes/media.$.ts. Every way a page shows a library picture is one site-runtime
// defineImages use, so a page never asks /media for a size the route would refuse.
//
// Not for covers: the abstract book and program covers are inline SVG (app/lib/cover.ts), drawn
// into the print document, and never pass through the library or this route.
import { defineImages } from "@dustinedwards/site-runtime/image";
import { SITE_ORIGIN } from "../site-meta";

export const MEDIA_PREFIX = "media/";

export const images = defineImages({
  uses: {
    // A picture in a page Carrel edits: the 48rem (768px) reading column (.reading in app.css).
    content: { layout: "constrained", width: 768 },
  },
});

/** The path a library key is served at. */
export const mediaPath = (key: string) => `/${key}`;

const KEY = /^media\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** The library key a URL in page content names (/media/... on this site), or null for anything else. */
export function mediaKeyOf(raw: string): string | null {
  let path = raw.trim();
  if (path.startsWith(SITE_ORIGIN)) path = path.slice(SITE_ORIGIN.length);
  if (!path.startsWith(`/${MEDIA_PREFIX}`)) return null;
  const key = path.slice(1).split(/[?#]/)[0] ?? "";
  return KEY.test(key) && !key.split("/").some((part) => part === "." || part === "..") ? key : null;
}

/** Every library key a page's source or html names, by its /media/ paths (over-detection only refuses a delete). */
export function mediaKeysIn(text: string): Set<string> {
  const keys = new Set<string>();
  for (const match of text.matchAll(/\/media\/[A-Za-z0-9._/-]+/g)) {
    const key = mediaKeyOf(match[0]);
    if (key) keys.add(key);
  }
  return keys;
}
