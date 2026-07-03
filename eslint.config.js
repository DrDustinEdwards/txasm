import tseslint from "typescript-eslint";

// The data-access layer is the security boundary (CLAUDE.md hard rule 2). D1 has
// no row-level security, so authorization lives in application code, and every
// read and write must go through createDataAccess in app/lib/data-access.ts.
//
// This rule forbids importing the Drizzle schema, the Drizzle client factory, or
// the D1 client constructor anywhere outside the three files that make up the
// data/auth infrastructure: the schema factory (app/db/index.server.ts), the
// data-access layer itself (app/lib/data-access.ts), and the Better Auth instance
// (app/lib/auth.server.ts, whose adapter legitimately needs the schema). Routes
// and components reach data through getDataAccess(env) only.
const boundaryPatterns = [
  {
    group: ["**/db/schema", "**/db/schema*"],
    message:
      "Do not import the Drizzle schema directly. Go through createDataAccess in app/lib/data-access.ts.",
  },
  {
    group: ["**/db/index.server"],
    message:
      "Do not import the Drizzle client factory directly. Use getDataAccess from app/lib/data-access.ts.",
  },
  {
    group: ["drizzle-orm/d1"],
    message:
      "Do not construct a Drizzle client outside the data-access layer. Use getDataAccess from app/lib/data-access.ts.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "build/",
      ".react-router/",
      "drizzle/",
      "worker-configuration.d.ts",
      "node_modules/",
    ],
  },
  {
    files: ["app/**/*.{ts,tsx}", "workers/**/*.ts", "scripts/**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "no-restricted-imports": ["error", { patterns: boundaryPatterns }],
    },
  },
  {
    // The infrastructure boundary itself. These three files are allowed to import
    // the schema and the Drizzle client; nothing else is.
    files: [
      "app/db/index.server.ts",
      "app/lib/data-access.ts",
      "app/lib/auth.server.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
);
