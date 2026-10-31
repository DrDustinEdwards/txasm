import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // An import map with every chunk's hash and integrity on each modulepreload, for Integrity-Policy (site-runtime ./csp).
  // The import map carries the render's nonce like React Router's other inline scripts.
  subResourceIntegrity: true,
} satisfies Config;
