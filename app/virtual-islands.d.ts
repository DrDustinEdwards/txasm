/**
 * Served by devkit's `siteScript()` (vite.config.ts): the page's script tag for /site.js, `/site-<hash>.js` with its
 * integrity in a build and the plain /site.js in `vite dev`. Its own file with no import or export, so the declaration
 * is ambient.
 */
declare module "virtual:islands" {
  export const SITE_SCRIPT: Readonly<{
    src: string;
    integrity?: string;
    crossOrigin?: "anonymous";
  }>;
}
