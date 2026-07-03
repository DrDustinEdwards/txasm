// Brand asset paths and colors in one named place, so the wordmark, the mark,
// and the favicon are wired from here instead of string literals scattered
// across the shells and the document head. This follows the no-hardcoding house
// rule: a meaningful literal lives once and is referenced everywhere.
//
// The SVG files live in public/ and are served from the site root, so these are
// absolute paths, safe to use in both an <img src> and a <link href>. No
// server-only imports, so this module is safe on both sides of the boundary.

// Full wordmark: the starburst emblem plus "TXASM". Use it where there is room
// for the wide lockup: the public site header and top nav.
export const BRAND = {
  wordmark: "/txasm-logo.svg",
  // Starburst emblem on its own, tightly cropped. Use it where the wordmark is
  // too wide: the favicon, the compact admin header, and the footer mark.
  mark: "/txasm-mark.svg",
} as const;

// Brand colors, kept next to the asset paths as the single source. TX is Texas
// blue; ASM and the emblem are Texas red. These are the values baked into the
// SVGs above; any component that needs to match the mark reads them from here.
export const BRAND_COLORS = {
  texasBlue: "#002868",
  texasRed: "#a30e28",
} as const;
