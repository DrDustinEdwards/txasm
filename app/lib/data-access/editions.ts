import { and, count, desc, eq, inArray, like } from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  DEFAULT_CURRENCY,
  EDITION_STATUSES,
  type EditionStatus,
  REGISTRATION_CATEGORY_KEYS,
  type RegistrationCategoryKey,
  type Season,
} from "../vocab";
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
import { PROGRAM_PUBLIC_STATUSES } from "./program-model";
import { publicEditionSummary, type PublicMeeting } from "./public-abstracts";

export interface EditionInput {
  name: string;
  season: Season;
  year: number;
  status?: EditionStatus;
}

// Edition edit patch. Only the registration and submission windows and the
// lifecycle status are editable here. Dates are optional; null clears a date.
export interface EditionPatch {
  status?: EditionStatus;
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
  submissionOpensAt?: Date | null;
  submissionDeadline?: Date | null;
  meetingStartsAt?: Date | null;
  meetingEndsAt?: Date | null;
  venueName?: string | null;
  venueAddress?: string | null;
  city?: string | null;
}

export interface RegistrationCategoryInput {
  editionId: string;
  key: RegistrationCategoryKey;
  label: string;
  amountCents: number; // money is stored in cents, formatted to dollars in the UI
  currency?: string;
  sortOrder?: number;
}

export interface RegistrationCategoryPatch {
  label?: string;
  amountCents?: number;
  currency?: string;
  sortOrder?: number;
  active?: boolean;
}

function assertAmountCents(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new ValidationError("Fee must be a whole, non-negative number of cents.");
  }
}

export function normalizeCurrency(currency?: string) {
  const value = currency?.trim().toLowerCase();
  return value && value.length > 0 ? value : DEFAULT_CURRENCY;
}

// Institution dedup key: lowercased, trimmed, whitespace collapsed, and LIKE
// wildcards removed so it is safe to interpolate into a search pattern. The seed
// and the ensure path use this same function so the unique index lines up.
function normalizeInstitutionName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[%_]/g, "");
}

export function createRegistrations(db: DB) {
  return {
    // Attendee scoping: a user reads their own registration; a chair reads any
    // in the edition. The PayPal capture webhook flips status to paid out of band.
    // Bodies land in Part B once PayPal credentials exist.
    listForEdition(actor: Actor, editionId: string): Promise<unknown[]> {
      throw new Error("not implemented");
    },
    getMine(actor: Actor, editionId: string): Promise<unknown> {
      throw new Error("not implemented");
    },
    startCheckout(
      actor: Actor,
      input: { editionId: string; categoryId: string },
    ): Promise<{ approveUrl: string }> {
      // Creates a PayPal order and returns its approval link for the payer.
      throw new Error("not implemented");
    },
    markPaidFromWebhook(input: { paypalOrderId: string }): Promise<unknown> {
      // Called by the verified PayPal webhook, not by a user, so it has no Actor.
      throw new Error("not implemented");
    },
  };
}

export function createEditions(db: DB) {
  return {
    // Admin view: every edition, newest first. The public listing (listPublic)
    // is a separate, narrower query added later.
    async list(actor: Actor) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      return db
        .select()
        .from(schema.edition)
        .orderBy(desc(schema.edition.meetingStartsAt));
    },

    // Admin only. Season must be one of the two values and (season, year) must be
    // unique. The slug is derived from both, e.g. "spring-2027".
    async create(actor: Actor, input: EditionInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();

      if (input.season !== "spring" && input.season !== "fall") {
        throw new ValidationError("Season must be spring or fall.");
      }
      if (!Number.isInteger(input.year)) {
        throw new ValidationError("Year must be a whole number.");
      }
      const name = input.name.trim();
      if (!name) throw new ValidationError("Name is required.");

      const existing = await db.query.edition.findFirst({
        where: and(
          eq(schema.edition.season, input.season),
          eq(schema.edition.year, input.year),
        ),
      });
      if (existing) {
        throw new AlreadyExistsError(
          `A meeting for ${input.season} ${input.year} already exists.`,
        );
      }

      const [created] = await db
        .insert(schema.edition)
        .values({
          slug: `${input.season}-${input.year}`,
          name,
          season: input.season,
          year: input.year,
          status: input.status ?? "draft",
        })
        .returning();
      return created;
    },

    // Admin read of a single edition by id, for the edit and category screens.
    // Chair-readable: chair-gated pages (program, speakers, book) load their
    // edition through this. isChair already includes platform admins.
    async getById(actor: Actor, editionId: string) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const row = await db.query.edition.findFirst({
        where: eq(schema.edition.id, editionId),
      });
      if (!row) throw new NotFoundError();
      return row;
    },

    // Admin edit of status and the registration and submission windows. A
    // deadline cannot fall before its matching opens-at when both are set.
    async update(actor: Actor, editionId: string, patch: EditionPatch) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.edition.findFirst({
        where: eq(schema.edition.id, editionId),
      });
      if (!row) throw new NotFoundError();

      if (patch.status && !EDITION_STATUSES.includes(patch.status)) {
        throw new ValidationError("Unknown meeting status.");
      }

      const regOpens =
        patch.registrationOpensAt !== undefined
          ? patch.registrationOpensAt
          : row.registrationOpensAt;
      const regCloses =
        patch.registrationClosesAt !== undefined
          ? patch.registrationClosesAt
          : row.registrationClosesAt;
      if (regOpens && regCloses && regCloses.getTime() < regOpens.getTime()) {
        throw new ValidationError(
          "Registration deadline cannot be before registration opens.",
        );
      }

      const subOpens =
        patch.submissionOpensAt !== undefined
          ? patch.submissionOpensAt
          : row.submissionOpensAt;
      const subDeadline =
        patch.submissionDeadline !== undefined
          ? patch.submissionDeadline
          : row.submissionDeadline;
      if (subOpens && subDeadline && subDeadline.getTime() < subOpens.getTime()) {
        throw new ValidationError(
          "Submission deadline cannot be before submission opens.",
        );
      }

      const meetStarts =
        patch.meetingStartsAt !== undefined
          ? patch.meetingStartsAt
          : row.meetingStartsAt;
      const meetEnds =
        patch.meetingEndsAt !== undefined
          ? patch.meetingEndsAt
          : row.meetingEndsAt;
      if (meetStarts && meetEnds && meetEnds.getTime() < meetStarts.getTime()) {
        throw new ValidationError(
          "The meeting cannot end before it starts.",
        );
      }

      const set: Partial<typeof schema.edition.$inferInsert> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.registrationOpensAt !== undefined) {
        set.registrationOpensAt = patch.registrationOpensAt;
      }
      if (patch.registrationClosesAt !== undefined) {
        set.registrationClosesAt = patch.registrationClosesAt;
      }
      if (patch.submissionOpensAt !== undefined) {
        set.submissionOpensAt = patch.submissionOpensAt;
      }
      if (patch.submissionDeadline !== undefined) {
        set.submissionDeadline = patch.submissionDeadline;
      }
      if (patch.meetingStartsAt !== undefined) {
        set.meetingStartsAt = patch.meetingStartsAt;
      }
      if (patch.meetingEndsAt !== undefined) {
        set.meetingEndsAt = patch.meetingEndsAt;
      }
      if (patch.venueName !== undefined) {
        set.venueName = patch.venueName?.trim() || null;
      }
      if (patch.venueAddress !== undefined) {
        set.venueAddress = patch.venueAddress?.trim() || null;
      }
      if (patch.city !== undefined) {
        set.city = patch.city?.trim() || null;
      }

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.edition)
          .set(set)
          .where(eq(schema.edition.id, editionId));
      }
      return this.getById(actor, editionId);
    },

    // Public archive index: every edition at a public stage (scheduled,
    // complete, archived), newest first, each with its accepted-abstract count.
    // No actor: it exposes only meeting metadata and counts, not abstracts.
    async listPublic(): Promise<PublicMeeting[]> {
      const rows = await db
        .select()
        .from(schema.edition)
        .where(inArray(schema.edition.status, [...PROGRAM_PUBLIC_STATUSES]))
        .orderBy(desc(schema.edition.meetingStartsAt));
      if (rows.length === 0) return [];
      const counts = await db
        .select({
          editionId: schema.abstract.editionId,
          count: count(),
        })
        .from(schema.abstract)
        .where(
          and(
            inArray(
              schema.abstract.editionId,
              rows.map((r) => r.id),
            ),
            eq(schema.abstract.status, "accepted"),
          ),
        )
        .groupBy(schema.abstract.editionId);
      const countByEdition = new Map(counts.map((c) => [c.editionId, c.count]));
      return rows.map((ed) => ({
        ...publicEditionSummary(ed),
        status: ed.status,
        abstractCount: countByEdition.get(ed.id) ?? 0,
      }));
    },

    // Public read by slug, used by the author submission routes to resolve a
    // meeting. No actor: it exposes only meeting metadata, not abstracts.
    async get(slug: string) {
      const row = await db.query.edition.findFirst({
        where: eq(schema.edition.slug, slug),
      });
      if (!row) throw new NotFoundError();
      return row;
    },
  };
}

// Registration categories and fees, per edition. Admin only. Money is stored
// in cents; the UI formats to dollars.
export function createRegistrationCategories(db: DB) {
  return {
    async listForEdition(actor: Actor, editionId: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      return db
        .select()
        .from(schema.registrationCategory)
        .where(eq(schema.registrationCategory.editionId, editionId))
        .orderBy(
          schema.registrationCategory.sortOrder,
          schema.registrationCategory.key,
        );
    },

    async create(actor: Actor, input: RegistrationCategoryInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();

      const label = input.label.trim();
      if (!label) throw new ValidationError("Label is required.");
      assertAmountCents(input.amountCents);
      if (!REGISTRATION_CATEGORY_KEYS.includes(input.key)) {
        throw new ValidationError(
          "Category type must be member, student, or nonmember.",
        );
      }

      const existing = await db.query.registrationCategory.findFirst({
        where: and(
          eq(schema.registrationCategory.editionId, input.editionId),
          eq(schema.registrationCategory.key, input.key),
        ),
      });
      if (existing) {
        throw new AlreadyExistsError(
          `A ${input.key} category already exists for this meeting.`,
        );
      }

      const [created] = await db
        .insert(schema.registrationCategory)
        .values({
          editionId: input.editionId,
          key: input.key,
          label,
          amountCents: input.amountCents,
          currency: normalizeCurrency(input.currency),
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: RegistrationCategoryPatch) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.registrationCategory.findFirst({
        where: eq(schema.registrationCategory.id, id),
      });
      if (!row) throw new NotFoundError();

      if (patch.label !== undefined && !patch.label.trim()) {
        throw new ValidationError("Label is required.");
      }
      if (patch.amountCents !== undefined) assertAmountCents(patch.amountCents);

      const set: Partial<typeof schema.registrationCategory.$inferInsert> = {};
      if (patch.label !== undefined) set.label = patch.label.trim();
      if (patch.amountCents !== undefined) set.amountCents = patch.amountCents;
      if (patch.currency !== undefined) {
        set.currency = normalizeCurrency(patch.currency);
      }
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
      if (patch.active !== undefined) set.active = patch.active;

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.registrationCategory)
          .set(set)
          .where(eq(schema.registrationCategory.id, id));
      }
      return db.query.registrationCategory.findFirst({
        where: eq(schema.registrationCategory.id, id),
      });
    },

    // Soft delete: the schema carries an active flag, so the row stays for
    // history and for any registration that already referenced it.
    async deactivate(actor: Actor, id: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.registrationCategory.findFirst({
        where: eq(schema.registrationCategory.id, id),
      });
      if (!row) throw new NotFoundError();
      await db
        .update(schema.registrationCategory)
        .set({ active: false })
        .where(eq(schema.registrationCategory.id, id));
      return { id, active: false };
    },
  };
}

// Abstract categories, per edition. Admin manages them; authors read them to
// pick one on the submission form. Hard delete is fine (no active flag).
export function createAbstractCategories(db: DB) {
  return {
    async listForEdition(actor: Actor, editionId: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      return db
        .select()
        .from(schema.abstractCategory)
        .where(eq(schema.abstractCategory.editionId, editionId))
        .orderBy(schema.abstractCategory.sortOrder, schema.abstractCategory.name);
    },

    // Author-facing read for the submission form. Any signed-in user picks one,
    // so this is not admin-gated; it exposes only category names.
    async listForSubmission(editionId: string) {
      return db
        .select()
        .from(schema.abstractCategory)
        .where(eq(schema.abstractCategory.editionId, editionId))
        .orderBy(schema.abstractCategory.sortOrder, schema.abstractCategory.name);
    },

    async create(
      actor: Actor,
      input: { editionId: string; name: string; sortOrder?: number },
    ) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const name = input.name.trim();
      if (!name) throw new ValidationError("Name is required.");

      const existing = await db.query.abstractCategory.findFirst({
        where: and(
          eq(schema.abstractCategory.editionId, input.editionId),
          eq(schema.abstractCategory.name, name),
        ),
      });
      if (existing) {
        throw new AlreadyExistsError(
          `A category named "${name}" already exists for this meeting.`,
        );
      }

      const [created] = await db
        .insert(schema.abstractCategory)
        .values({
          editionId: input.editionId,
          name,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(
      actor: Actor,
      id: string,
      patch: { name?: string; sortOrder?: number },
    ) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.abstractCategory.findFirst({
        where: eq(schema.abstractCategory.id, id),
      });
      if (!row) throw new NotFoundError();

      const set: Partial<typeof schema.abstractCategory.$inferInsert> = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new ValidationError("Name is required.");
        if (name !== row.name) {
          const dupe = await db.query.abstractCategory.findFirst({
            where: and(
              eq(schema.abstractCategory.editionId, row.editionId),
              eq(schema.abstractCategory.name, name),
            ),
          });
          if (dupe) {
            throw new AlreadyExistsError(
              `A category named "${name}" already exists for this meeting.`,
            );
          }
        }
        set.name = name;
      }
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.abstractCategory)
          .set(set)
          .where(eq(schema.abstractCategory.id, id));
      }
      return db.query.abstractCategory.findFirst({
        where: eq(schema.abstractCategory.id, id),
      });
    },

    async remove(actor: Actor, id: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const row = await db.query.abstractCategory.findFirst({
        where: eq(schema.abstractCategory.id, id),
      });
      if (!row) throw new NotFoundError();
      await db
        .delete(schema.abstractCategory)
        .where(eq(schema.abstractCategory.id, id));
      return { id };
    },
  };
}

// Institution master list. Part of authoring, so any signed-in user may search
// it and append to it (read-and-append only, no admin gating). The affiliation
// autocomplete searches it; ensure is the self-grow path when an author types a
// new institution. Dedup is by normalized_name.
export function createInstitutions(db: DB) {
  return {
    // Up to ten matches by substring on the normalized name, ordered by name.
    async search(actor: Actor, query: string) {
      const normalized = normalizeInstitutionName(query);
      if (!normalized) return [];
      // The normalized name has no % or _ (stripped in normalize), so it is safe
      // to interpolate into the LIKE pattern.
      return db
        .select({
          id: schema.institution.id,
          name: schema.institution.name,
          city: schema.institution.city,
          region: schema.institution.region,
          country: schema.institution.country,
        })
        .from(schema.institution)
        .where(like(schema.institution.normalizedName, `%${normalized}%`))
        .orderBy(schema.institution.name)
        .limit(10);
    },

    // Find by normalized name or insert a new one, then return it. Used on submit
    // when an author picked a free-text institution not already in the list.
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
