import type { Preload } from "@dustinedwards/site-runtime/preload";
import interLatin from "@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2?url";

/** The font every page's text paints in first: Inter's latin subset, the same file root.tsx's opsz.css loads. */
export const FONT_PRELOADS: Preload[] = [{ href: interLatin, as: "font", type: "font/woff2" }];
