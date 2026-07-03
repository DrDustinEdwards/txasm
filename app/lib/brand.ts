// The single brand entry point. In-app logo spots render the inline components
// so their fills read the --brand-blue / --brand-red tokens (app.css) and track
// the [data-theme] toggle, not just the OS setting. The favicon is the one spot
// that stays a file path: a <link> cannot inline a component, so it points at
// the self-adapting SVG in public/, which carries its own prefers-color-scheme
// block. No server-only imports, so this module is safe on both sides.

export { BrandWordmark } from "~/components/brand-wordmark";
export { BrandMark } from "~/components/brand-mark";

// Full wordmark for the wide lockup (public header, top nav); mark for the
// compact or standalone spots (admin header, footer). Both are the components
// above. Only the favicon resolves to a path.
export const BRAND = {
  favicon: "/txasm-mark.svg",
} as const;
