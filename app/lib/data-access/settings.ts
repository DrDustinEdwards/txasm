import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { DEFAULT_CURRENCY, DEFAULT_WORD_LIMIT } from "../vocab";
import {
  type Actor,
  type DB,
  ForbiddenError,
  isAdmin,
  NotFoundError,
  ValidationError,
} from "./core";
import { normalizeCurrency } from "./editions";

// ---------------------------------------------------------------------------
// Platform settings. A single row of org identity and tunable defaults, read by
// the shell and edited on the admin settings screen. footerLinks is stored as a
// JSON array and returned parsed. The single row is enforced by a fixed id.
// ---------------------------------------------------------------------------

export const PLATFORM_SETTINGS_ID = "default";

export interface FooterLink {
  label: string;
  url: string;
}

export interface PlatformSettings {
  orgName: string;
  shortName: string;
  orgFullName: string;
  tagline: string;
  foundingYear: number | null;
  contactEmail: string | null;
  facebookUrl: string | null;
  footerLinks: FooterLink[];
  defaultCurrency: string;
  defaultAbstractWordLimit: number;
}

export interface PlatformSettingsPatch {
  orgName?: string;
  shortName?: string;
  orgFullName?: string;
  tagline?: string;
  foundingYear?: number | null;
  contactEmail?: string | null;
  facebookUrl?: string | null;
  footerLinks?: FooterLink[];
  defaultCurrency?: string;
  defaultAbstractWordLimit?: number;
}

// Parse the stored footerLinks JSON into a clean {label,url} array, dropping
// anything malformed so a bad value never breaks the shell.
function parseFooterLinks(raw: string | null): FooterLink[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const links: FooterLink[] = [];
  for (const entry of parsed) {
    if (entry && typeof entry === "object") {
      const label = String((entry as Record<string, unknown>).label ?? "").trim();
      const url = String((entry as Record<string, unknown>).url ?? "").trim();
      if (label && url) links.push({ label, url });
    }
  }
  return links;
}

// Clean a submitted footerLinks list the same way, for writes.
function cleanFooterLinks(links: FooterLink[]): FooterLink[] {
  const cleaned: FooterLink[] = [];
  for (const link of links) {
    const label = (link?.label ?? "").trim();
    const url = (link?.url ?? "").trim();
    if (label && url) cleaned.push({ label, url });
  }
  return cleaned;
}

export function resolveSettings(
  row: typeof schema.platformSettings.$inferSelect,
): PlatformSettings {
  return {
    orgName: row.orgName ?? "",
    shortName: row.shortName ?? "",
    orgFullName: row.orgFullName ?? "",
    tagline: row.tagline ?? "",
    foundingYear: row.foundingYear,
    contactEmail: row.contactEmail,
    facebookUrl: row.facebookUrl,
    footerLinks: parseFooterLinks(row.footerLinks),
    defaultCurrency: row.defaultCurrency,
    defaultAbstractWordLimit: row.defaultAbstractWordLimit,
  };
}

// Platform settings: the single org-identity-and-defaults row. get() is a
// public read used by the shell, creating the row with named defaults on first
// read if it is missing. update() is platform-admin only.
export function createSettings(db: DB) {
  return {
    async get(): Promise<PlatformSettings> {
      const existing = await db.query.platformSettings.findFirst({
        where: eq(schema.platformSettings.id, PLATFORM_SETTINGS_ID),
      });
      if (existing) return resolveSettings(existing);
      // First-read fallback for an unseeded database. Identity stays blank for an
      // admin to fill in; the tunable defaults come from the named vocab config.
      const [created] = await db
        .insert(schema.platformSettings)
        .values({
          id: PLATFORM_SETTINGS_ID,
          defaultCurrency: DEFAULT_CURRENCY,
          defaultAbstractWordLimit: DEFAULT_WORD_LIMIT,
        })
        .onConflictDoNothing()
        .returning();
      if (created) return resolveSettings(created);
      // A concurrent first read won the insert; read it back.
      const row = await db.query.platformSettings.findFirst({
        where: eq(schema.platformSettings.id, PLATFORM_SETTINGS_ID),
      });
      if (!row) throw new NotFoundError("settings not found");
      return resolveSettings(row);
    },

    async update(
      actor: Actor,
      patch: PlatformSettingsPatch,
    ): Promise<PlatformSettings> {
      if (!isAdmin(actor)) throw new ForbiddenError();

      const set: Partial<typeof schema.platformSettings.$inferInsert> = {};
      if (patch.orgName !== undefined) set.orgName = patch.orgName.trim() || null;
      if (patch.shortName !== undefined) {
        set.shortName = patch.shortName.trim() || null;
      }
      if (patch.orgFullName !== undefined) {
        set.orgFullName = patch.orgFullName.trim() || null;
      }
      if (patch.tagline !== undefined) set.tagline = patch.tagline.trim() || null;
      if (patch.foundingYear !== undefined) {
        if (patch.foundingYear !== null) {
          if (
            !Number.isInteger(patch.foundingYear) ||
            patch.foundingYear < 1800 ||
            patch.foundingYear > 2200
          ) {
            throw new ValidationError("Enter a valid founding year.");
          }
        }
        set.foundingYear = patch.foundingYear;
      }
      if (patch.contactEmail !== undefined) {
        const email = patch.contactEmail?.trim() ?? "";
        if (email && !email.includes("@")) {
          throw new ValidationError("Enter a valid contact email.");
        }
        set.contactEmail = email || null;
      }
      if (patch.facebookUrl !== undefined) {
        const url = patch.facebookUrl?.trim() ?? "";
        if (url && !/^https?:\/\//i.test(url)) {
          throw new ValidationError("The Facebook URL must start with http.");
        }
        set.facebookUrl = url || null;
      }
      if (patch.footerLinks !== undefined) {
        set.footerLinks = JSON.stringify(cleanFooterLinks(patch.footerLinks));
      }
      if (patch.defaultCurrency !== undefined) {
        set.defaultCurrency = normalizeCurrency(patch.defaultCurrency);
      }
      if (patch.defaultAbstractWordLimit !== undefined) {
        if (
          !Number.isInteger(patch.defaultAbstractWordLimit) ||
          patch.defaultAbstractWordLimit < 1
        ) {
          throw new ValidationError(
            "The default word limit must be a whole number of one or more.",
          );
        }
        set.defaultAbstractWordLimit = patch.defaultAbstractWordLimit;
      }

      // Ensure the row exists, then apply. get() handles create-on-first-read.
      await this.get();
      if (Object.keys(set).length > 0) {
        await db
          .update(schema.platformSettings)
          .set(set)
          .where(eq(schema.platformSettings.id, PLATFORM_SETTINGS_ID));
      }
      return this.get();
    },
  };
}
