import { slugify } from "@drdustinedwards/site-helpers/slug";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { type GeneratedRecord, mayStart } from "capsomer/behavior/generated-file";
import * as schema from "../../db/schema";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  type DocumentCategory,
  type DocumentStatus,
  fileKindForMime,
  PDF_MIME_TYPE,
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

function assertDocumentCategory(value: string): DocumentCategory {
  if (!DOCUMENT_CATEGORIES.includes(value as DocumentCategory)) {
    throw new ValidationError("Choose a valid document category.");
  }
  return value as DocumentCategory;
}

// Writes to a document are allowed for a platform admin, or a chair of the
// meeting the document belongs to. A document with no meeting (a newsletter) is
// admin-only.
function assertDocumentWrite(actor: Actor, editionId: string | null): void {
  if (isAdmin(actor)) return;
  if (editionId && isChair(actor, editionId)) return;
  throw new ForbiddenError();
}

// Deterministic slug/title/front matter for a generated document, one per
// category per edition. The edition slug keeps the archive URL readable.
function generatedDocMeta(
  category: DocumentCategory,
  ed: { slug: string; name: string; year: number; season: Season },
): { slug: string; title: string; year: number; season: Season } {
  const isBook = category === "abstract_book";
  return {
    slug: `${ed.slug}-${isBook ? "abstract-book" : "program"}`,
    title: `${ed.name} ${isBook ? "Abstract Book" : "Program"}`,
    year: ed.year,
    season: ed.season,
  };
}

export interface DocumentUploadInput {
  category: DocumentCategory;
  title: string;
  year?: number | null;
  season?: Season | null;
  editionId?: string | null;
  editor?: string | null;
  r2Key?: string | null;
  fileName?: string | null;
  // The uploaded file's MIME. fileKind is derived from it, so the stored kind
  // always matches the real file. Defaults to PDF when omitted (generated docs).
  mimeType?: string;
  slug?: string;
  sortOrder?: number;
}

export interface DocumentPatch {
  category?: DocumentCategory;
  status?: DocumentStatus;
  title?: string;
  year?: number | null;
  season?: Season | null;
  editionId?: string | null;
  editor?: string | null;
  r2Key?: string | null;
  fileName?: string | null;
  slug?: string;
  sortOrder?: number;
}

async function findGeneratedDoc(db: DB, editionId: string, category: DocumentCategory) {
  return db.query.document.findFirst({
    where: and(
      eq(schema.document.editionId, editionId),
      eq(schema.document.category, category),
      eq(schema.document.source, "generated"),
    ),
  });
}

// A generated document is published once it is ready, and a brand image never (CLAUDE.md, Uploads).
function assertPublishable(row: { source: string; genStatus: string | null; category: string }) {
  if (row.category === "brand_image") {
    throw new ValidationError("Brand images are internal and cannot be published.");
  }
  if (row.source === "generated" && row.genStatus !== "ready") {
    throw new ValidationError("Generate the document before publishing it.");
  }
}

export function createDocuments(db: DB) {
  return {
    async listByCategory(category: DocumentCategory) {
      return db
        .select()
        .from(schema.document)
        .where(and(eq(schema.document.category, category), eq(schema.document.status, "published")))
        .orderBy(schema.document.sortOrder, desc(schema.document.year), schema.document.title);
    },

    async listRecent(categories: readonly DocumentCategory[], limit: number) {
      return db
        .select()
        .from(schema.document)
        .where(
          and(
            inArray(schema.document.category, [...categories]),
            eq(schema.document.status, "published"),
          ),
        )
        .orderBy(desc(schema.document.createdAt))
        .limit(limit);
    },

    async getBySlug(slug: string) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.slug, slug),
      });
      if (!row || row.status !== "published" || row.category === "brand_image") return null;
      return row;
    },

    // Resolve a document for the serve routes. A published document is public, so
    // the actor may be null. A draft or generated document is visible only to an
    // admin or a chair of its meeting, matching the write gate. Throws NotFound
    // when the slug is unknown and Forbidden when an unpublished doc is not the
    // caller's to see.
    async getForServe(actor: Actor | null, slug: string) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.slug, slug),
      });
      if (!row) throw new NotFoundError();
      // Brand images are internal (CLAUDE.md, Uploads): never public, even if a row was published.
      if (row.status === "published" && row.category !== "brand_image") return row;
      if (!actor) throw new ForbiddenError();
      assertDocumentWrite(actor, row.editionId);
      return row;
    },

    async listAll(actor: Actor, category?: DocumentCategory) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const where = category
        ? eq(schema.document.category, assertDocumentCategory(category))
        : undefined;
      return db
        .select()
        .from(schema.document)
        .where(where)
        .orderBy(schema.document.category, desc(schema.document.year), schema.document.title);
    },

    async listForEdition(editionId: string) {
      return db
        .select()
        .from(schema.document)
        .where(
          and(
            eq(schema.document.editionId, editionId),
            eq(schema.document.status, "published"),
            ne(schema.document.category, "brand_image"),
          ),
        )
        .orderBy(schema.document.sortOrder, schema.document.title);
    },

    async getGeneratedForEdition(actor: Actor, editionId: string, category: DocumentCategory) {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const row = await findGeneratedDoc(db, editionId, category);
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        genStatus: row.genStatus,
        r2Key: row.r2Key,
        fileName: row.fileName,
        abstractCount: row.abstractCount,
        generatedAt: row.generatedAt,
        updatedAt: row.updatedAt,
        // What Capsomer's generated-file panel reads. A run's start is the row's
        // updatedAt; the file is offered only when ready, since the download
        // routes serve a ready file only.
        record: {
          status: row.genStatus,
          startedAt: row.updatedAt,
          generatedAt: row.genStatus === "ready" ? row.generatedAt : null,
        } satisfies GeneratedRecord,
      };
    },

    async create(actor: Actor, input: DocumentUploadInput) {
      assertDocumentWrite(actor, input.editionId ?? null);
      const category = assertDocumentCategory(input.category);
      const title = input.title.trim();
      if (!title) throw new ValidationError("Document title is required.");
      const slug = slugify(input.slug || title);
      if (!slug) throw new ValidationError("Document slug is required.");
      const clash = await db.query.document.findFirst({
        where: eq(schema.document.slug, slug),
      });
      if (clash) {
        throw new AlreadyExistsError(`A document with slug "${slug}" already exists.`);
      }
      const mimeType = input.mimeType ?? PDF_MIME_TYPE;
      const [created] = await db
        .insert(schema.document)
        .values({
          category,
          source: "uploaded",
          status: "draft",
          title,
          year: input.year ?? null,
          season: input.season ?? null,
          editionId: input.editionId ?? null,
          editor: input.editor?.trim() || null,
          r2Key: input.r2Key ?? null,
          fileName: input.fileName ?? null,
          mimeType,
          fileKind: fileKindForMime(mimeType),
          slug,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, patch: DocumentPatch) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.id, id),
      });
      if (!row) throw new NotFoundError();
      assertDocumentWrite(actor, row.editionId);

      const set: Partial<typeof schema.document.$inferInsert> = {};
      if (patch.category !== undefined) {
        set.category = assertDocumentCategory(patch.category);
      }
      if (patch.status !== undefined) {
        if (!DOCUMENT_STATUSES.includes(patch.status)) {
          throw new ValidationError("Choose a valid document status.");
        }
        if (patch.status === "published") {
          assertPublishable({ ...row, ...set });
        }
        set.status = patch.status;
      }
      if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (!title) throw new ValidationError("Document title is required.");
        set.title = title;
      }
      if (patch.slug !== undefined) {
        const slug = slugify(patch.slug);
        if (!slug) throw new ValidationError("Document slug is required.");
        if (slug !== row.slug) {
          const clash = await db.query.document.findFirst({
            where: eq(schema.document.slug, slug),
          });
          if (clash) {
            throw new AlreadyExistsError(`A document with slug "${slug}" already exists.`);
          }
        }
        set.slug = slug;
      }
      if (patch.year !== undefined) set.year = patch.year;
      if (patch.season !== undefined) set.season = patch.season;
      if (patch.editionId !== undefined) set.editionId = patch.editionId;
      if (patch.editor !== undefined) set.editor = patch.editor?.trim() || null;
      if (patch.r2Key !== undefined) set.r2Key = patch.r2Key;
      if (patch.fileName !== undefined) set.fileName = patch.fileName;
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

      if (Object.keys(set).length > 0) {
        await db.update(schema.document).set(set).where(eq(schema.document.id, id));
      }
      return db.query.document.findFirst({ where: eq(schema.document.id, id) });
    },

    async remove(actor: Actor, id: string) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.id, id),
      });
      if (!row) throw new NotFoundError();
      assertDocumentWrite(actor, row.editionId);
      await db.delete(schema.document).where(eq(schema.document.id, id));
      return { id, r2Key: row.r2Key, source: row.source };
    },

    // Mark a generated document generating before the Browser Rendering call
    // (which happens in the route where env.BROWSER is in scope). Rejects a
    // second concurrent run: if the row is already generating and was set
    // recently, the caller should wait. A stale generating row (from a crashed
    // run) is allowed to restart. The previous r2Key is kept so an existing PDF
    // stays downloadable until the new one is ready.
    async recordGenerating(actor: Actor, input: { editionId: string; category: DocumentCategory }) {
      const { editionId } = input;
      const category = assertDocumentCategory(input.category);
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.id, editionId),
      });
      if (!ed) throw new NotFoundError("meeting not found");

      const existing = await findGeneratedDoc(db, editionId, category);
      // Capsomer's generated-file lock: a run marked generating holds it for 5
      // minutes from its start (updatedAt), after which it is taken to have died.
      if (
        existing?.genStatus === "generating" &&
        !mayStart({ status: "generating", startedAt: existing.updatedAt })
      ) {
        throw new ValidationError(
          "A document is already being generated for this meeting. Give it a minute, then refresh.",
        );
      }
      if (existing) {
        await db
          .update(schema.document)
          .set({ genStatus: "generating", generatedById: actor.userId })
          .where(eq(schema.document.id, existing.id));
        return { id: existing.id };
      }
      const meta = generatedDocMeta(category, ed);
      const [created] = await db
        .insert(schema.document)
        .values({
          category,
          source: "generated",
          status: "draft",
          title: meta.title,
          slug: meta.slug,
          year: meta.year,
          season: meta.season,
          editionId,
          genStatus: "generating",
          generatedById: actor.userId,
        })
        .returning();
      return { id: created.id };
    },

    // Mark a generated document ready after its PDF is stored in R2. Keeps the
    // draft/published status untouched, so a regenerate of a published document
    // stays published.
    async recordReady(
      actor: Actor,
      id: string,
      input: { r2Key: string; fileName: string; abstractCount?: number },
    ) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.id, id),
      });
      if (!row) throw new NotFoundError();
      assertDocumentWrite(actor, row.editionId);
      await db
        .update(schema.document)
        .set({
          genStatus: "ready",
          r2Key: input.r2Key,
          fileName: input.fileName,
          abstractCount: input.abstractCount ?? null,
          generatedById: actor.userId,
          generatedAt: new Date(),
        })
        .where(eq(schema.document.id, id));
      return { id };
    },

    async recordFailed(actor: Actor, id: string) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.id, id),
      });
      if (!row) return { id: null };
      assertDocumentWrite(actor, row.editionId);
      await db
        .update(schema.document)
        .set({ genStatus: "failed" })
        .where(eq(schema.document.id, id));
      return { id };
    },

    async publish(actor: Actor, id: string) {
      const row = await db.query.document.findFirst({
        where: eq(schema.document.id, id),
      });
      if (!row) throw new NotFoundError();
      assertDocumentWrite(actor, row.editionId);
      assertPublishable(row);
      await db
        .update(schema.document)
        .set({ status: "published" })
        .where(eq(schema.document.id, id));
      return { id };
    },
  };
}
