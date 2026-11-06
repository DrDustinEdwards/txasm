import { defineConfig } from "oxlint";
import { base, react, node } from "@dustinedwards/devkit/oxlint";

// The data-access layer is the security boundary (CLAUDE.md hard rule 1). D1 has
// no row-level security, so authorization lives in application code, and every
// read and write must go through createDataAccess in app/lib/data-access.ts.
//
// This rule forbids importing the Drizzle schema, the Drizzle client factory, or
// the D1 client constructor anywhere outside the three files that make up the
// data/auth infrastructure: the schema factory (app/db/index.server.ts), the
// data-access layer itself (app/lib/data-access.ts and its modules under
// app/lib/data-access/), and the Better Auth instance
// (app/lib/auth.server.ts, whose adapter legitimately needs the schema). Routes
// and components reach data through getDataAccess(env) only.
// tests/boundary.test.ts proves an import from outside the boundary fails.
const boundaryPatterns = [
  {
    group: ["**/db/schema", "**/db/schema*"],
    message: "Do not import the Drizzle schema directly. Go through createDataAccess in app/lib/data-access.ts.",
  },
  {
    group: ["**/db/index.server"],
    message: "Do not import the Drizzle client factory directly. Use getDataAccess from app/lib/data-access.ts.",
  },
  {
    group: ["drizzle-orm/d1"],
    message:
      "Do not construct a Drizzle client outside the data-access layer. Use getDataAccess from app/lib/data-access.ts.",
  },
];

export default defineConfig({
  extends: [base, react],
  rules: {
    // off in devkit 0.24.0
    "typescript/no-non-null-assertion": "off",
    // off in devkit 0.24.0
    "react/only-export-components": "off",
    // off in devkit 0.24.0
    "jsx-a11y/prefer-tag-over-role": "off",
    // off in devkit 0.24.0
    "jsx-a11y/control-has-associated-label": "off",
    // off in devkit 0.24.0
    "jsx-a11y/media-has-caption": "off",
  },
  ignorePatterns: [
    // devkit's base ignores, which Oxlint 1.92 does not carry through `extends` (devkit 0.24.0 exports them).
    "build/",
    "dist/",
    ".react-router/",
    ".wrangler/",
    "worker-configuration.d.ts",
    "**/*.gen.ts",
    // Generated migrations, and the vendored Paged.js (app/lib/paged.ts) and pdf.js builds, kept byte for byte.
    "drizzle/",
    "public/pagedjs/",
    "public/pdfjs/",
  ],
  overrides: [
    // This repository's node tests live in tests/, not test/.
    { files: ["scripts/**", "bin/**", "test/**", "tests/**"], ...node },
    {
      files: ["app/**/*.{ts,tsx}", "workers/**/*.ts", "scripts/**/*.ts"],
      rules: { "eslint/no-restricted-imports": ["error", { patterns: boundaryPatterns }] },
    },
    {
      // The infrastructure boundary itself. These files are allowed to import
      // the schema and the Drizzle client; nothing else is.
      files: ["app/db/index.server.ts", "app/lib/data-access.ts", "app/lib/data-access/**/*.ts", "app/lib/auth.server.ts"],
      rules: { "eslint/no-restricted-imports": "off" },
    },
  ],
});
