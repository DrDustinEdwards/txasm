import { readFileSync, readdirSync } from "node:fs";

// Every migration in drizzle/, in order, applied to a fresh Miniflare D1, so a
// test runs against the site's real tables.
export async function applyMigrations(db: { prepare(sql: string): { run(): Promise<unknown> } }) {
  const dir = new URL("../drizzle/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(new URL(file, dir), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }
}
