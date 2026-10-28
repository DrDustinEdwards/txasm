import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// The Drizzle client factory. This file and the data-access layer
// (app/lib/data-access.ts and app/lib/data-access/) are the only places that
// touch the schema and the D1 client; the eslint boundary rule keeps it that way. Route code never imports this; it goes through getDataAccess.
export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}
