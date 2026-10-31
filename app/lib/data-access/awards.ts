import { and, desc, eq, like, or } from "drizzle-orm";
import * as schema from "../../db/schema";
import { isEmptyRichText, sanitizeBody } from "../richtext";
import {
  type Actor,
  AlreadyExistsError,
  type DB,
  ForbiddenError,
  isAdmin,
  isChair,
  NotFoundError,
  ValidationError,
} from "./core";

// ---------------------------------------------------------------------------
// Awards. Definition and recipient inputs. namesakeBio/description are sanitized
// to the abstract body allowlist (em/sup/sub) on write. A recipient always has a
// personName and a year; everything else is optional. editionId ties a recipient
// to the meeting where the award was given when that meeting is in the system.
// ---------------------------------------------------------------------------

export interface AwardInput {
  slug: string;
  name: string;
  namesakeBio?: string | null;
  description?: string | null;
  sortOrder?: number;
}

export interface AwardPatch {
  slug?: string;
  name?: string;
  namesakeBio?: string | null;
  description?: string | null;
  sortOrder?: number;
}

export interface AwardRecipientInput {
  awardId: string;
  editionId?: string | null;
  year: string;
  category?: string | null;
  placement?: string | null;
  personName: string;
  institution?: string | null;
  mentor?: string | null;
  sortOrder?: number;
}

export interface AwardRecipientPatch {
  editionId?: string | null;
  year?: string;
  category?: string | null;
  placement?: string | null;
  personName?: string;
  institution?: string | null;
  mentor?: string | null;
  sortOrder?: number;
}

// Free-text term plus optional exact/loose filters for the public awardee
// search. All values are bound as query parameters, never interpolated.
export interface AwardSearchFilters {
  awardSlug?: string;
  year?: string;
  institution?: string;
}

// One recipient row grouped under a category within a year on the award page.
export interface AwardRecipientView {
  id: string;
  year: string;
  category: string | null;
  placement: string | null;
  personName: string;
  institution: string | null;
  mentor: string | null;
  editionId: string | null;
}

export interface AwardYearGroup {
  year: string;
  categories: Array<{
    category: string | null;
    recipients: AwardRecipientView[];
  }>;
}

// A search hit: the recipient plus the award it belongs to, for linking back.
export interface AwardSearchResult extends AwardRecipientView {
  awardSlug: string;
  awardName: string;
}

// Normalize an award slug to the live-site shape: lowercase, spaces and runs of
// non-alphanumerics collapsed to single hyphens, trimmed of leading/trailing
// hyphens. Keeps seed slugs and admin-entered slugs consistent.
function normalizeAwardSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Group flat recipient rows into years, then categories within each year,
// preserving the stored sortOrder (rows arrive pre-sorted). A null category
// keeps its own bucket so uncategorized awards render as a plain list.
function groupRecipientsByYear(
  rows: AwardRecipientView[],
): AwardYearGroup[] {
  const years: AwardYearGroup[] = [];
  const yearIndex = new Map<string, AwardYearGroup>();
  for (const row of rows) {
    let group = yearIndex.get(row.year);
    if (!group) {
      group = { year: row.year, categories: [] };
      yearIndex.set(row.year, group);
      years.push(group);
    }
    const key = row.category ?? "";
    let bucket = group.categories.find((c) => (c.category ?? "") === key);
    if (!bucket) {
      bucket = { category: row.category, recipients: [] };
      group.categories.push(bucket);
    }
    bucket.recipients.push(row);
  }
  return years;
}

// Sanitize an award's namesake bio or description to the abstract body allowlist
// (em/sup/sub), collapsing an empty result to null so blank fields do not store
// stray markup.
function sanitizeAwardHtml(value: string | null | undefined): string | null {
  if (value == null) return null;
  const html = sanitizeBody(value);
  return isEmptyRichText(html) ? null : html;
}

// A recipient write is allowed for a platform admin, or for a chair of the
// edition the recipient is tied to. A recipient with no edition is admin-only.
function requireRecipientWriter(actor: Actor, editionId: string | null): void {
  if (isAdmin(actor)) return;
  if (editionId && isChair(actor, editionId)) return;
  throw new ForbiddenError();
}

// Validate and normalize a new recipient's fields (personName and year required).
function validateRecipient(input: AwardRecipientInput) {
  const personName = input.personName.trim();
  if (!personName) throw new ValidationError("Recipient name is required.");
  const year = input.year.trim();
  if (!year) throw new ValidationError("Year is required.");
  return {
    editionId: input.editionId ?? null,
    year,
    category: input.category?.trim() || null,
    placement: input.placement?.trim() || null,
    personName,
    institution: input.institution?.trim() || null,
    mentor: input.mentor?.trim() || null,
    sortOrder: input.sortOrder ?? 0,
  };
}

// Awards. The branch's named awards. Definitions are a public read (the
// awardees index and per-award pages); create/update/remove are platform-admin
// only. namesakeBio/description are sanitized to the em/sup/sub allowlist on
// write, so stored HTML is safe to render verbatim.
export function createAwards(db: DB) {
  return {
    async listAll() {
      return db
        .select()
        .from(schema.award)
        .orderBy(schema.award.sortOrder, schema.award.name);
    },

    // The slug an award renamed away from `slug` has now, or null for a slug never renamed (award_slug_redirect).
    // Public: the award route's renameRedirect lookup.
    async renamedSlug(slug: string): Promise<string | null> {
      const [row] = await db
        .select({ slug: schema.award.slug })
        .from(schema.awardSlugRedirect)
        .innerJoin(schema.award, eq(schema.award.id, schema.awardSlugRedirect.awardId))
        .where(eq(schema.awardSlugRedirect.fromSlug, slug))
        .limit(1);
      return row?.slug ?? null;
    },

    // One award plus its recipients grouped by year and category. Public.
    async getBySlug(slug: string) {
      const awardRow = await db.query.award.findFirst({
        where: eq(schema.award.slug, slug),
      });
      if (!awardRow) throw new NotFoundError("award not found");
      const rows = await db
        .select({
          id: schema.awardRecipient.id,
          year: schema.awardRecipient.year,
          category: schema.awardRecipient.category,
          placement: schema.awardRecipient.placement,
          personName: schema.awardRecipient.personName,
          institution: schema.awardRecipient.institution,
          mentor: schema.awardRecipient.mentor,
          editionId: schema.awardRecipient.editionId,
        })
        .from(schema.awardRecipient)
        .where(eq(schema.awardRecipient.awardId, awardRow.id))
        .orderBy(
          schema.awardRecipient.sortOrder,
          schema.awardRecipient.personName,
        );
      return { award: awardRow, years: groupRecipientsByYear(rows) };
    },

    async create(actor: Actor, input: AwardInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const slug = normalizeAwardSlug(input.slug || input.name || "");
      if (!slug) throw new ValidationError("Award slug is required.");
      const name = input.name.trim();
      if (!name) throw new ValidationError("Award name is required.");
      const existing = await db.query.award.findFirst({
        where: eq(schema.award.slug, slug),
      });
      if (existing) {
        throw new AlreadyExistsError(
          `An award with slug "${slug}" already exists.`,
        );
      }
      const namesakeBio = sanitizeAwardHtml(input.namesakeBio);
      const description = sanitizeAwardHtml(input.description);
      const [created] = await db
        .insert(schema.award)
        .values({
          slug,
          name,
          namesakeBio,
          description,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: AwardPatch) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.award.findFirst({
        where: eq(schema.award.id, id),
      });
      if (!row) throw new NotFoundError();

      const set: Partial<typeof schema.award.$inferInsert> = {};
      if (patch.slug !== undefined) {
        const slug = normalizeAwardSlug(patch.slug);
        if (!slug) throw new ValidationError("Award slug is required.");
        if (slug !== row.slug) {
          const clash = await db.query.award.findFirst({
            where: eq(schema.award.slug, slug),
          });
          if (clash) {
            throw new AlreadyExistsError(
              `An award with slug "${slug}" already exists.`,
            );
          }
        }
        set.slug = slug;
      }
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new ValidationError("Award name is required.");
        set.name = name;
      }
      if (patch.namesakeBio !== undefined) {
        set.namesakeBio = sanitizeAwardHtml(patch.namesakeBio);
      }
      if (patch.description !== undefined) {
        set.description = sanitizeAwardHtml(patch.description);
      }
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        const update = db.update(schema.award).set(set).where(eq(schema.award.id, id));
        if (set.slug && set.slug !== row.slug) {
          // A rename keeps the old address answering: the old slug redirects to this award (renamedSlug), and the new
          // slug, now live, is no redirect's any more. One batch, so the award never moves without its redirect.
          await db.batch([
            update,
            db
              .insert(schema.awardSlugRedirect)
              .values({ fromSlug: row.slug, awardId: id })
              .onConflictDoUpdate({ target: schema.awardSlugRedirect.fromSlug, set: { awardId: id } }),
            db.delete(schema.awardSlugRedirect).where(eq(schema.awardSlugRedirect.fromSlug, set.slug)),
          ]);
        } else {
          await update;
        }
      }
      return db.query.award.findFirst({ where: eq(schema.award.id, id) });
    },

    async remove(actor: Actor, id: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.award.findFirst({
        where: eq(schema.award.id, id),
      });
      if (!row) throw new NotFoundError();
      // award_recipient.award_id is ON DELETE CASCADE, so recipients go with it.
      await db.delete(schema.award).where(eq(schema.award.id, id));
      return { id };
    },
  };
}

// Award recipients. listForAward is public; writes are admin, or a chair of the
// edition a recipient is tied to (the every-meeting maintenance path). A
// recipient with no edition is admin-only. personName and year are required.
export function createAwardRecipients(db: DB) {
  return {
    async listForAward(awardId: string): Promise<AwardRecipientView[]> {
      return db
        .select({
          id: schema.awardRecipient.id,
          year: schema.awardRecipient.year,
          category: schema.awardRecipient.category,
          placement: schema.awardRecipient.placement,
          personName: schema.awardRecipient.personName,
          institution: schema.awardRecipient.institution,
          mentor: schema.awardRecipient.mentor,
          editionId: schema.awardRecipient.editionId,
        })
        .from(schema.awardRecipient)
        .where(eq(schema.awardRecipient.awardId, awardId))
        .orderBy(
          schema.awardRecipient.sortOrder,
          schema.awardRecipient.personName,
        );
    },

    async create(actor: Actor, input: AwardRecipientInput) {
      requireRecipientWriter(actor, input.editionId ?? null);
      const parent = await db.query.award.findFirst({
        where: eq(schema.award.id, input.awardId),
      });
      if (!parent) throw new NotFoundError("award not found");
      const values = validateRecipient(input);
      const [created] = await db
        .insert(schema.awardRecipient)
        .values({ awardId: input.awardId, ...values })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: AwardRecipientPatch) {
      const row = await db.query.awardRecipient.findFirst({
        where: eq(schema.awardRecipient.id, id),
      });
      if (!row) throw new NotFoundError();
      // The actor must be allowed for the recipient's current edition, and, when
      // moving it to another edition, for the destination too.
      requireRecipientWriter(actor, row.editionId);
      if (patch.editionId !== undefined) {
        requireRecipientWriter(actor, patch.editionId ?? null);
      }

      const set: Partial<typeof schema.awardRecipient.$inferInsert> = {};
      if (patch.editionId !== undefined) set.editionId = patch.editionId ?? null;
      if (patch.year !== undefined) {
        const year = patch.year.trim();
        if (!year) throw new ValidationError("Year is required.");
        set.year = year;
      }
      if (patch.category !== undefined) {
        set.category = patch.category?.trim() || null;
      }
      if (patch.placement !== undefined) {
        set.placement = patch.placement?.trim() || null;
      }
      if (patch.personName !== undefined) {
        const personName = patch.personName.trim();
        if (!personName) throw new ValidationError("Recipient name is required.");
        set.personName = personName;
      }
      if (patch.institution !== undefined) {
        set.institution = patch.institution?.trim() || null;
      }
      if (patch.mentor !== undefined) set.mentor = patch.mentor?.trim() || null;
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.awardRecipient)
          .set(set)
          .where(eq(schema.awardRecipient.id, id));
      }
      return db.query.awardRecipient.findFirst({
        where: eq(schema.awardRecipient.id, id),
      });
    },

    async remove(actor: Actor, id: string) {
      const row = await db.query.awardRecipient.findFirst({
        where: eq(schema.awardRecipient.id, id),
      });
      if (!row) throw new NotFoundError();
      requireRecipientWriter(actor, row.editionId);
      await db
        .delete(schema.awardRecipient)
        .where(eq(schema.awardRecipient.id, id));
      return { id };
    },

    // Public search across person, institution, mentor, year, and award name and
    // slug, with optional award/year/institution filters. Every term is bound as
    // a query parameter (drizzle `like`/`eq`), never string-interpolated.
    async search(
      query: string,
      filters: AwardSearchFilters = {},
    ): Promise<AwardSearchResult[]> {
      const term = query.trim();
      const conditions = [];
      if (term) {
        const pattern = `%${term}%`;
        conditions.push(
          or(
            like(schema.awardRecipient.personName, pattern),
            like(schema.awardRecipient.institution, pattern),
            like(schema.awardRecipient.mentor, pattern),
            like(schema.awardRecipient.year, pattern),
            like(schema.award.name, pattern),
            like(schema.award.slug, pattern),
          ),
        );
      }
      if (filters.awardSlug) {
        conditions.push(eq(schema.award.slug, filters.awardSlug));
      }
      if (filters.year) {
        conditions.push(eq(schema.awardRecipient.year, filters.year));
      }
      if (filters.institution) {
        conditions.push(
          like(schema.awardRecipient.institution, `%${filters.institution}%`),
        );
      }

      return db
        .select({
          id: schema.awardRecipient.id,
          year: schema.awardRecipient.year,
          category: schema.awardRecipient.category,
          placement: schema.awardRecipient.placement,
          personName: schema.awardRecipient.personName,
          institution: schema.awardRecipient.institution,
          mentor: schema.awardRecipient.mentor,
          editionId: schema.awardRecipient.editionId,
          awardSlug: schema.award.slug,
          awardName: schema.award.name,
        })
        .from(schema.awardRecipient)
        .innerJoin(
          schema.award,
          eq(schema.awardRecipient.awardId, schema.award.id),
        )
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(
          desc(schema.awardRecipient.year),
          schema.award.sortOrder,
          schema.awardRecipient.sortOrder,
        )
        .limit(200);
    },
  };
}
