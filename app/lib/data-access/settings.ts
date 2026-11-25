import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { DEFAULT_WORD_LIMIT } from "../vocab";
import { type Actor, type DB, ForbiddenError, isAdmin, ValidationError } from "./core";
import { isEmail } from "@dustinedwards/site-runtime/email";
import { isHttpUrl } from "@dustinedwards/site-runtime/url";

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
  defaultAbstractWordLimit?: number;
}

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
      if (label && isSafeLink(url)) links.push({ label, url });
    }
  }
  return links;
}

// A footer link is an http(s) address or a path on this site, never a javascript: or data: URL.
const isSafeLink = (url: string) => /^(https?:\/\/|\/(?!\/))/i.test(url);

function cleanFooterLinks(links: FooterLink[]): FooterLink[] {
  const cleaned: FooterLink[] = [];
  for (const link of links) {
    const label = (link?.label ?? "").trim();
    const url = (link?.url ?? "").trim();
    if (!label || !url) continue;
    if (!isSafeLink(url))
      throw new ValidationError("A footer link must start with http, https or /.");
    cleaned.push({ label, url });
  }
  return cleaned;
}

export function resolveSettings(
  row: Omit<typeof schema.platformSettings.$inferSelect, "id" | "createdAt" | "updatedAt">,
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
    defaultAbstractWordLimit: row.defaultAbstractWordLimit,
  };
}

export function createSettings(db: DB) {
  return {
    async get(): Promise<PlatformSettings> {
      const existing = await db.query.platformSettings.findFirst({
        where: eq(schema.platformSettings.id, PLATFORM_SETTINGS_ID),
      });
      // Before an admin first saves (or the seed script runs), the blank identity and the named defaults.
      return resolveSettings(
        existing ?? {
          orgName: null,
          shortName: null,
          orgFullName: null,
          tagline: null,
          foundingYear: null,
          contactEmail: null,
          facebookUrl: null,
          footerLinks: null,
          defaultAbstractWordLimit: DEFAULT_WORD_LIMIT,
        },
      );
    },

    async update(actor: Actor, patch: PlatformSettingsPatch): Promise<PlatformSettings> {
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
        if (email && !isEmail(email)) {
          throw new ValidationError("Enter a valid contact email.");
        }
        set.contactEmail = email || null;
      }
      if (patch.facebookUrl !== undefined) {
        const url = patch.facebookUrl?.trim() ?? "";
        if (url && !isHttpUrl(url)) {
          throw new ValidationError("The Facebook URL must start with http.");
        }
        set.facebookUrl = url || null;
      }
      if (patch.footerLinks !== undefined) {
        set.footerLinks = JSON.stringify(cleanFooterLinks(patch.footerLinks));
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

      if (Object.keys(set).length > 0) {
        await db
          .insert(schema.platformSettings)
          .values({ id: PLATFORM_SETTINGS_ID, ...set })
          .onConflictDoUpdate({ target: schema.platformSettings.id, set });
      }
      return this.get();
    },
  };
}
