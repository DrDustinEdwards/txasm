// The single brand entry point. In-app logo spots render the inline components
// so their fills read the --brand-blue / --brand-red tokens (app.css) and track
// the [data-theme] toggle, not just the OS setting. The icon files are Prelum's
// (public/icon.svg and the rest, iconLinks in root.tsx). No server-only imports,
// so this module is safe on both sides.

export { BrandWordmark } from "~/components/brand-wordmark";
export { BrandMark } from "~/components/brand-mark";
export { BrandFooter } from "~/components/brand-footer";
