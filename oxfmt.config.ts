import { defineConfig } from "oxfmt";
import { format } from "@dustinedwards/devkit/oxfmt";

export default defineConfig({
  ...format,
  ignorePatterns: [
    ...(format.ignorePatterns ?? []),
    // Generated SQL migrations and their drizzle-kit metadata, and the vendored Paged.js and pdf.js builds, kept byte for byte.
    "drizzle/",
    "public/pagedjs/",
    "public/pdfjs/",
  ],
});
