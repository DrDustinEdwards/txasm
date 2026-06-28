import { defineConfig } from "drizzle-kit";

// Generates SQL migrations from app/db/schema.ts into ./drizzle, which is also
// wrangler's migrations_dir. wrangler applies them to D1 (local and remote);
// drizzle-kit only authors the SQL, it does not touch the database here.
export default defineConfig({
  dialect: "sqlite",
  schema: "./app/db/schema.ts",
  out: "./drizzle",
});
