import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { siteScript } from "@dustinedwards/devkit/vite/site-script";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // /site.js (app/site.ts) and the islands it starts (app/islands/): what a page that does not hydrate runs in the
    // browser, in place of React (root.tsx, the `hydrate` handle).
    siteScript(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  // Minify the Worker: startup has to finish inside 1 s and grows with the bundle
  // (.worker-size.json). Source maps are uploaded, so stack traces stay readable.
  environments: {
    ssr: { build: { minify: true } },
  },
});
