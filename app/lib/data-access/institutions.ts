import { eq } from "drizzle-orm";
import { likeContains } from "@dustinedwards/site-runtime/d1";
import * as schema from "../../db/schema";
import { type Actor, type DB, ValidationError } from "./core";

// Institution dedup key: lowercased, trimmed, whitespace collapsed, and LIKE
// wildcards removed so it is safe to interpolate into a search pattern. The seed
// and the ensure path use this same function so the unique index lines up.
function normalizeInstitutionName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ").replace(/[%_]/g, "");
}

// Institution master list. Part of authoring, so any signed-in user may search
// it and append to it (read-and-append only, no admin gating). The affiliation
// autocomplete searches it; ensure is the self-grow path when an author types a
// new institution. Dedup is by normalized_name.
export function createInstitutions(db: DB) {
  return {
    async search(actor: Actor, query: string) {
      const normalized = normalizeInstitutionName(query);
      if (!normalized) return [];
      return db
        .select({
          id: schema.institution.id,
          name: schema.institution.name,
          city: schema.institution.city,
          region: schema.institution.region,
          country: schema.institution.country,
        })
        .from(schema.institution)
        .where(likeContains(schema.institution.normalizedName, normalized))
        .orderBy(schema.institution.name)
        .limit(10);
    },

    async ensure(
      actor: Actor,
      input: { name: string; city?: string; region?: string; country?: string },
    ) {
      const name = input.name.trim();
      if (!name) throw new ValidationError("Institution name is required.");
      const normalized = normalizeInstitutionName(name);

      const existing = await db.query.institution.findFirst({
        where: eq(schema.institution.normalizedName, normalized),
      });
      if (existing) return existing;

      await db
        .insert(schema.institution)
        .values({
          name,
          city: input.city?.trim() || null,
          region: input.region?.trim() || null,
          country: input.country?.trim() || "USA",
          normalizedName: normalized,
        })
        .onConflictDoNothing();

      const row = await db.query.institution.findFirst({
        where: eq(schema.institution.normalizedName, normalized),
      });
      if (!row) throw new ValidationError("Could not save the institution.");
      return row;
    },
  };
}
