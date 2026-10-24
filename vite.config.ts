import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
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
