import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { isEmptyRichText, sanitizeBody } from "../richtext";
import { SPEAKER_ROLES, type SpeakerRole } from "../vocab";
import {
  type Actor,
  type DB,
  ForbiddenError,
  isChair,
  NotFoundError,
  ValidationError,
} from "./core";

// ---------------------------------------------------------------------------
// Invited speakers and sponsors. Both are per-edition and chair/admin managed.
// Speaker bios are sanitized to the abstract body allowlist (em/sup/sub); the
// remaining text fields are plain and escaped at render time. Image r2 keys stay
// out of the write path for now (upload UI is deferred).
// ---------------------------------------------------------------------------

// The SpeakerRole vocabulary lives in ./vocab and is imported above.
export interface InvitedSpeakerInput {
  editionId: string;
  name: string;
  affiliation?: string | null;
  role?: SpeakerRole | null;
  talkTitle?: string | null;
  bio?: string; // sanitized to em/sup/sub on write
  sortOrder?: number;
}

export interface InvitedSpeakerPatch {
  name?: string;
  affiliation?: string | null;
  role?: SpeakerRole | null;
  talkTitle?: string | null;
  bio?: string;
  sortOrder?: number;
}

export interface SponsorInput {
  editionId: string;
  name: string;
  tier?: string | null;
  url?: string | null;
  sortOrder?: number;
}

export interface SponsorPatch {
  name?: string;
  tier?: string | null;
  url?: string | null;
  sortOrder?: number;
}

// Public sponsor shape for the program page. Plain text, escaped at render time.
export interface SponsorPublic {
  id: string;
  name: string;
  tier: string | null;
  url: string | null;
  logoR2Key: string | null;
}

// Public invited-speaker shape for the program page. name, affiliation, and
// talkTitle are plain text escaped at render time; bio is stored sanitized HTML.
export interface SpeakerPublic {
  id: string;
  name: string;
  affiliation: string | null;
  role: SpeakerRole | null;
  talkTitle: string | null;
  bio: string | null;
}

// Invited speakers, per edition. Chair/admin only. The bio is sanitized to the
// abstract body allowlist (em/sup/sub); name, affiliation, and talk title are
// plain text and escaped at render time. The headshot r2 key is not written
// here; upload is deferred.
export function createInvitedSpeakers(db: DB) {
  return {
    async listForEdition(actor: Actor, editionId: string) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      return db
        .select()
        .from(schema.invitedSpeaker)
        .where(eq(schema.invitedSpeaker.editionId, editionId))
        .orderBy(schema.invitedSpeaker.sortOrder, schema.invitedSpeaker.name);
    },

    async create(actor: Actor, input: InvitedSpeakerInput) {
      if (!isChair(actor, input.editionId)) throw new ForbiddenError();
      const name = input.name.trim();
      if (!name) throw new ValidationError("Speaker name is required.");
      if (input.role != null && !SPEAKER_ROLES.includes(input.role)) {
        throw new ValidationError("Choose a valid speaker role.");
      }
      const bio = input.bio ? sanitizeBody(input.bio) : null;
      const [created] = await db
        .insert(schema.invitedSpeaker)
        .values({
          editionId: input.editionId,
          name,
          affiliation: input.affiliation?.trim() || null,
          role: input.role ?? null,
          talkTitle: input.talkTitle?.trim() || null,
          bio: bio && !isEmptyRichText(bio) ? bio : null,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: InvitedSpeakerPatch) {
      const row = await db.query.invitedSpeaker.findFirst({
        where: eq(schema.invitedSpeaker.id, id),
      });
      if (!row) throw new NotFoundError();
      if (!isChair(actor, row.editionId)) throw new ForbiddenError();

      const set: Partial<typeof schema.invitedSpeaker.$inferInsert> = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new ValidationError("Speaker name is required.");
        set.name = name;
      }
      if (patch.affiliation !== undefined) {
        set.affiliation = patch.affiliation?.trim() || null;
      }
      if (patch.role !== undefined) {
        if (patch.role != null && !SPEAKER_ROLES.includes(patch.role)) {
          throw new ValidationError("Choose a valid speaker role.");
        }
        set.role = patch.role ?? null;
      }
      if (patch.talkTitle !== undefined) {
        set.talkTitle = patch.talkTitle?.trim() || null;
      }
      if (patch.bio !== undefined) {
        const bio = patch.bio ? sanitizeBody(patch.bio) : null;
        set.bio = bio && !isEmptyRichText(bio) ? bio : null;
      }
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.invitedSpeaker)
          .set(set)
          .where(eq(schema.invitedSpeaker.id, id));
      }
      return db.query.invitedSpeaker.findFirst({
        where: eq(schema.invitedSpeaker.id, id),
      });
    },

    async remove(actor: Actor, id: string) {
      const row = await db.query.invitedSpeaker.findFirst({
        where: eq(schema.invitedSpeaker.id, id),
      });
      if (!row) throw new NotFoundError();
      if (!isChair(actor, row.editionId)) throw new ForbiddenError();
      // program_item.speaker_id is ON DELETE SET NULL, so any item pointing here
      // keeps its slot and falls back to its kind label.
      await db
        .delete(schema.invitedSpeaker)
        .where(eq(schema.invitedSpeaker.id, id));
      return { id };
    },
  };
}

// A sponsor link is rendered as an href on the public program, where escaping
// does not stop a javascript: URL, so only http and https are stored (Grok audit
// 2026-10-21, TX-2; the same rule settings applies to the Facebook URL).
function sponsorUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim() ?? "";
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    throw new ValidationError("The sponsor link must start with http:// or https://.");
  }
  return url;
}

// Sponsors, per edition. Chair/admin only. Name and tier are plain text and
// escaped at render time; the link must be http or https. The logo r2 key is not
// written here; upload is deferred.
export function createSponsors(db: DB) {
  return {
    async listForEdition(actor: Actor, editionId: string) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      return db
        .select()
        .from(schema.sponsor)
        .where(eq(schema.sponsor.editionId, editionId))
        .orderBy(schema.sponsor.sortOrder, schema.sponsor.name);
    },

    async create(actor: Actor, input: SponsorInput) {
      if (!isChair(actor, input.editionId)) throw new ForbiddenError();
      const name = input.name.trim();
      if (!name) throw new ValidationError("Sponsor name is required.");
      const [created] = await db
        .insert(schema.sponsor)
        .values({
          editionId: input.editionId,
          name,
          tier: input.tier?.trim() || null,
          url: sponsorUrl(input.url),
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: SponsorPatch) {
      const row = await db.query.sponsor.findFirst({
        where: eq(schema.sponsor.id, id),
      });
      if (!row) throw new NotFoundError();
      if (!isChair(actor, row.editionId)) throw new ForbiddenError();

      const set: Partial<typeof schema.sponsor.$inferInsert> = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new ValidationError("Sponsor name is required.");
        set.name = name;
      }
      if (patch.tier !== undefined) set.tier = patch.tier?.trim() || null;
      if (patch.url !== undefined) set.url = sponsorUrl(patch.url);
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db.update(schema.sponsor).set(set).where(eq(schema.sponsor.id, id));
      }
      return db.query.sponsor.findFirst({ where: eq(schema.sponsor.id, id) });
    },

    async remove(actor: Actor, id: string) {
      const row = await db.query.sponsor.findFirst({
        where: eq(schema.sponsor.id, id),
      });
      if (!row) throw new NotFoundError();
      if (!isChair(actor, row.editionId)) throw new ForbiddenError();
      await db.delete(schema.sponsor).where(eq(schema.sponsor.id, id));
      return { id };
    },
  };
}
