import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { extractPlainText } from "../richtext";
import {
  ABSTRACT_LEVELS,
  type AbstractFormat,
  type AbstractLevel,
} from "../vocab";
import {
  assembleBookAbstracts,
  type BookArrangementInput,
  type BookRenderData,
  type BookRenderEntry,
  type BookRenderIndexEntry,
  type BookRenderSection,
  bookSectionCodeRange,
  bookSectionLabel,
  type BookView,
  loadBookView,
  recomputeBookCodes,
} from "./book-model";
import {
  type Actor,
  byIdChunks,
  chunk,
  type DB,
  ForbiddenError,
  insertChunkSize,
  isChair,
  NotFoundError,
  ValidationError,
} from "./core";

// Abstract book builder and reader. Chair/admin only. The read model and the
// arranged render data are plain structures so the pure ./book renderer stays a
// function of them.
export function createBooks(db: DB) {
  return {
    // Generate (or regenerate) the draft book for a meeting from its accepted
    // abstracts: bucket by (level, format, category) into sections, order each
    // section alphabetically by presenting author last name, and assign codes.
    // A published book is not clobbered; the chair reopens it first.
    async generate(actor: Actor, editionId: string): Promise<BookView> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const ed = (
        await db
          .select({ id: schema.edition.id })
          .from(schema.edition)
          .where(eq(schema.edition.id, editionId))
          .limit(1)
      )[0];
      if (!ed) throw new NotFoundError("meeting not found");

      const existing = (
        await db
          .select()
          .from(schema.abstractBook)
          .where(eq(schema.abstractBook.editionId, editionId))
          .limit(1)
      )[0];
      if (existing && existing.status === "published") {
        throw new ValidationError(
          "This book is published. Reopen it to edit before regenerating.",
        );
      }

      const absRows = await db
        .select({
          id: schema.abstract.id,
          title: schema.abstract.title,
          level: schema.abstract.level,
          format: schema.abstract.format,
          categoryId: schema.abstract.categoryId,
        })
        .from(schema.abstract)
        .where(
          and(
            eq(schema.abstract.editionId, editionId),
            eq(schema.abstract.status, "accepted"),
          ),
        );

      const parts = await assembleBookAbstracts(db, absRows.map((a) => a.id));
      const categoryRows = await db
        .select()
        .from(schema.abstractCategory)
        .where(eq(schema.abstractCategory.editionId, editionId));
      const categoryById = new Map(categoryRows.map((c) => [c.id, c]));

      type Row = (typeof absRows)[number];
      const effFormat = (row: Row): AbstractFormat | null =>
        parts.get(row.id)?.presentationType ?? row.format ?? null;
      const presenter = (row: Row) => {
        const authors = parts.get(row.id)?.authors ?? [];
        return authors.find((a) => a.isPresenting) ?? authors[0] ?? null;
      };

      // Bucket accepted abstracts by (level, effective format, category).
      const buckets = new Map<
        string,
        {
          level: AbstractLevel | null;
          format: AbstractFormat | null;
          categoryId: string | null;
          rows: Row[];
        }
      >();
      for (const row of absRows) {
        const format = effFormat(row);
        const key = `${row.level ?? ""}|${format ?? ""}|${row.categoryId ?? ""}`;
        const bucket =
          buckets.get(key) ??
          {
            level: row.level,
            format,
            categoryId: row.categoryId ?? null,
            rows: [],
          };
        bucket.rows.push(row);
        buckets.set(key, bucket);
      }

      const levelIndex = (l: AbstractLevel | null) =>
        l === null ? ABSTRACT_LEVELS.length : ABSTRACT_LEVELS.indexOf(l);
      const formatIndex = (f: AbstractFormat | null) =>
        f === "poster" ? 0 : f === "oral" ? 1 : 2;
      const categoryIndex = (id: string | null) =>
        id === null ? Number.MAX_SAFE_INTEGER : categoryById.get(id)?.sortOrder ?? 0;
      const catName = (id: string | null) =>
        id ? categoryById.get(id)?.name ?? null : null;

      const orderedBuckets = [...buckets.values()].sort(
        (a, b) =>
          levelIndex(a.level) - levelIndex(b.level) ||
          formatIndex(a.format) - formatIndex(b.format) ||
          categoryIndex(a.categoryId) - categoryIndex(b.categoryId) ||
          bookSectionLabel(a.level, a.format, catName(a.categoryId)).localeCompare(
            bookSectionLabel(b.level, b.format, catName(b.categoryId)),
            "en",
            { sensitivity: "base" },
          ),
      );

      // Starting order within a section: presenting author last name, then first
      // name, then title.
      for (const bucket of orderedBuckets) {
        bucket.rows.sort((x, y) => {
          const px = presenter(x);
          const py = presenter(y);
          return (
            (px?.lastName ?? "").localeCompare(py?.lastName ?? "", "en", {
              sensitivity: "base",
            }) ||
            (px?.firstName ?? "").localeCompare(py?.firstName ?? "", "en", {
              sensitivity: "base",
            }) ||
            extractPlainText(x.title).localeCompare(
              extractPlainText(y.title),
              "en",
              { sensitivity: "base" },
            )
          );
        });
      }

      const bookId = existing?.id ?? crypto.randomUUID();
      const sectionRows = orderedBuckets.map((bucket, i) => ({
        id: crypto.randomUUID(),
        bookId,
        title: bookSectionLabel(bucket.level, bucket.format, catName(bucket.categoryId)),
        sortOrder: i,
      }));
      const entryRows = orderedBuckets.flatMap((bucket, si) =>
        bucket.rows.map((row, j) => ({
          id: crypto.randomUUID(),
          bookId,
          sectionId: sectionRows[si].id,
          abstractId: row.id,
          sortOrder: j,
          code: null as string | null,
          included: true,
        })),
      );

      if (existing) {
        // Regenerate replaces a draft arrangement; deleting sections cascades to
        // their entries.
        await db
          .delete(schema.bookSection)
          .where(eq(schema.bookSection.bookId, bookId));
        await db
          .update(schema.abstractBook)
          .set({ status: "draft", generatedById: actor.userId, updatedAt: new Date() })
          .where(eq(schema.abstractBook.id, bookId));
      } else {
        await db.insert(schema.abstractBook).values({
          id: bookId,
          editionId,
          status: "draft",
          generatedById: actor.userId,
        });
      }
      // A row binds one parameter per column (timestamps included), so each
      // batch stays under D1's limit of 100.
      for (const batch of chunk(sectionRows, insertChunkSize(9))) {
        await db.insert(schema.bookSection).values(batch);
      }
      for (const batch of chunk(entryRows, insertChunkSize(9))) {
        await db.insert(schema.bookEntry).values(batch);
      }
      await recomputeBookCodes(db, bookId);

      const view = await loadBookView(db, editionId);
      if (!view) throw new NotFoundError("book not found after generate");
      return view;
    },

    // The editor read model for a meeting's book, or null when none exists.
    async get(actor: Actor, editionId: string): Promise<BookView | null> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      return loadBookView(db, editionId);
    },

    // Apply a drag-drop arrangement (sections in order, each with its entry ids
    // in order), re-sequence positions, and reflow the affected prefix runs.
    async reorder(
      actor: Actor,
      editionId: string,
      arrangement: BookArrangementInput,
    ): Promise<BookView> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const book = (
        await db
          .select()
          .from(schema.abstractBook)
          .where(eq(schema.abstractBook.editionId, editionId))
          .limit(1)
      )[0];
      if (!book) throw new NotFoundError("no book for this meeting");
      if (book.status === "published") {
        throw new ValidationError("Reopen the book before editing.");
      }

      const sectionRows = await db
        .select({ id: schema.bookSection.id })
        .from(schema.bookSection)
        .where(eq(schema.bookSection.bookId, book.id));
      const validSections = new Set(sectionRows.map((s) => s.id));
      const entryRows = await db
        .select({ id: schema.bookEntry.id })
        .from(schema.bookEntry)
        .where(eq(schema.bookEntry.bookId, book.id));
      const validEntries = new Set(entryRows.map((e) => e.id));

      const placements: Array<{
        entryId: string;
        sectionId: string;
        sortOrder: number;
      }> = [];
      const seen = new Set<string>();
      for (const section of arrangement.sections) {
        if (!validSections.has(section.sectionId)) {
          throw new ValidationError("unknown section in arrangement");
        }
        section.entryIds.forEach((entryId, i) => {
          if (!validEntries.has(entryId)) {
            throw new ValidationError("unknown entry in arrangement");
          }
          if (seen.has(entryId)) {
            throw new ValidationError("duplicate entry in arrangement");
          }
          seen.add(entryId);
          placements.push({ entryId, sectionId: section.sectionId, sortOrder: i });
        });
      }
      if (seen.size !== validEntries.size) {
        throw new ValidationError("arrangement must include every entry once");
      }

      for (const p of placements) {
        await db
          .update(schema.bookEntry)
          .set({ sectionId: p.sectionId, sortOrder: p.sortOrder, updatedAt: new Date() })
          .where(eq(schema.bookEntry.id, p.entryId));
      }
      await recomputeBookCodes(db, book.id);

      const view = await loadBookView(db, editionId);
      if (!view) throw new NotFoundError("book not found");
      return view;
    },

    // Exclude or re-include one entry (e.g. a post-acceptance withdrawal), then
    // close or reopen the affected prefix run.
    async setIncluded(
      actor: Actor,
      editionId: string,
      entryId: string,
      included: boolean,
    ): Promise<BookView> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const book = (
        await db
          .select()
          .from(schema.abstractBook)
          .where(eq(schema.abstractBook.editionId, editionId))
          .limit(1)
      )[0];
      if (!book) throw new NotFoundError("no book for this meeting");
      if (book.status === "published") {
        throw new ValidationError("Reopen the book before editing.");
      }
      const entry = (
        await db
          .select({ id: schema.bookEntry.id })
          .from(schema.bookEntry)
          .where(
            and(
              eq(schema.bookEntry.id, entryId),
              eq(schema.bookEntry.bookId, book.id),
            ),
          )
          .limit(1)
      )[0];
      if (!entry) throw new NotFoundError("entry not found");

      await db
        .update(schema.bookEntry)
        .set({ included, updatedAt: new Date() })
        .where(eq(schema.bookEntry.id, entryId));
      await recomputeBookCodes(db, book.id);

      const view = await loadBookView(db, editionId);
      if (!view) throw new NotFoundError("book not found");
      return view;
    },

    // The pure data the arranged renderer in ./book consumes on preview and
    // publish: sections in order, included entries with their codes, ordered
    // authors and numbered affiliations, sanitized title/body, and the
    // all-authors-to-codes index. Excluded entries and empty sections are dropped.
    async renderData(actor: Actor, editionId: string): Promise<BookRenderData> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const book = (
        await db
          .select()
          .from(schema.abstractBook)
          .where(eq(schema.abstractBook.editionId, editionId))
          .limit(1)
      )[0];
      if (!book) throw new NotFoundError("no book for this meeting");
      const ed = (
        await db
          .select({
            name: schema.edition.name,
            season: schema.edition.season,
            year: schema.edition.year,
            meetingStartsAt: schema.edition.meetingStartsAt,
            meetingEndsAt: schema.edition.meetingEndsAt,
          })
          .from(schema.edition)
          .where(eq(schema.edition.id, editionId))
          .limit(1)
      )[0];

      const sections = await db
        .select()
        .from(schema.bookSection)
        .where(eq(schema.bookSection.bookId, book.id))
        .orderBy(schema.bookSection.sortOrder);
      const allEntries = await db
        .select()
        .from(schema.bookEntry)
        .where(eq(schema.bookEntry.bookId, book.id))
        .orderBy(schema.bookEntry.sortOrder);
      const entries = allEntries.filter((e) => e.included);

      const absRows = await byIdChunks(
        entries.map((e) => e.abstractId),
        (part) => db.select().from(schema.abstract).where(inArray(schema.abstract.id, part)),
      );
      const absById = new Map(absRows.map((a) => [a.id, a]));
      const parts = await assembleBookAbstracts(db, entries.map((e) => e.abstractId));

      const bySection = new Map<string, typeof entries>();
      for (const e of entries) {
        const list = bySection.get(e.sectionId) ?? [];
        list.push(e);
        bySection.set(e.sectionId, list);
      }

      const renderSections: BookRenderSection[] = [];
      for (const section of sections) {
        const sectionEntries = (bySection.get(section.id) ?? []).sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        if (sectionEntries.length === 0) continue;
        const renderEntries: BookRenderEntry[] = sectionEntries.map((e) => {
          const abs = absById.get(e.abstractId);
          const meta = parts.get(e.abstractId);
          return {
            code: e.code,
            title: abs?.title ?? "",
            background: abs?.background ?? null,
            methods: abs?.methods ?? null,
            results: abs?.results ?? null,
            conclusions: abs?.conclusions ?? null,
            bodyText: abs?.bodyText ?? null,
            presentationType: meta?.presentationType ?? null,
            authors: meta?.authors ?? [],
            affiliations: meta?.affiliations ?? [],
          };
        });
        renderSections.push({
          id: section.id,
          title: section.title,
          codeRange: bookSectionCodeRange(sectionEntries.map((e) => e.code)),
          entries: renderEntries,
        });
      }

      // All-authors index: each author to the codes they appear in, alphabetical
      // by last name. Built from arrangement data (codes), not pagination.
      const indexByKey = new Map<
        string,
        { name: string; lastName: string; firstName: string; codes: string[] }
      >();
      for (const section of renderSections) {
        for (const entry of section.entries) {
          if (!entry.code) continue;
          for (const author of entry.authors) {
            const first = author.firstName.trim();
            const last = author.lastName.trim();
            if (!first && !last) continue;
            const key = `${last.toLowerCase()} ${first.toLowerCase()}`;
            const existingEntry =
              indexByKey.get(key) ??
              {
                name: `${first} ${last}`.trim(),
                lastName: last,
                firstName: first,
                codes: [] as string[],
              };
            if (!existingEntry.codes.includes(entry.code)) {
              existingEntry.codes.push(entry.code);
            }
            indexByKey.set(key, existingEntry);
          }
        }
      }
      const authorIndex: BookRenderIndexEntry[] = [...indexByKey.values()]
        .sort(
          (a, b) =>
            a.lastName.localeCompare(b.lastName, "en", { sensitivity: "base" }) ||
            a.firstName.localeCompare(b.firstName, "en", { sensitivity: "base" }),
        )
        .map((entry) => ({ name: entry.name, codes: entry.codes }));

      return {
        edition: {
          name: ed?.name ?? "",
          season: ed?.season ?? "spring",
          year: ed?.year ?? 0,
          meetingStartsAt: ed?.meetingStartsAt ?? null,
          meetingEndsAt: ed?.meetingEndsAt ?? null,
        },
        status: book.status,
        sections: renderSections,
        authorIndex,
        entryCount: entries.length,
      };
    },

    // Freeze the book: store the rendered HTML (the caller renders it from
    // renderData through the pure ./book renderer, which stays out of this data
    // boundary) and flip status to published. The prior publishedHtml is kept
    // until this succeeds, so a book is never left without a render.
    async publish(
      actor: Actor,
      editionId: string,
      publishedHtml: string,
    ): Promise<{ status: "published"; publishedAt: Date }> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const book = (
        await db
          .select()
          .from(schema.abstractBook)
          .where(eq(schema.abstractBook.editionId, editionId))
          .limit(1)
      )[0];
      if (!book) throw new NotFoundError("no book for this meeting");
      const now = new Date();
      await db
        .update(schema.abstractBook)
        .set({
          status: "published",
          publishedHtml,
          publishedAt: now,
          generatedById: actor.userId,
          updatedAt: now,
        })
        .where(eq(schema.abstractBook.id, book.id));
      return { status: "published", publishedAt: now };
    },

    // Reopen a published book for editing. The last publishedHtml is kept until a
    // successful re-publish.
    async reopen(actor: Actor, editionId: string): Promise<BookView> {
      if (!isChair(actor, editionId)) throw new ForbiddenError();
      const book = (
        await db
          .select()
          .from(schema.abstractBook)
          .where(eq(schema.abstractBook.editionId, editionId))
          .limit(1)
      )[0];
      if (!book) throw new NotFoundError("no book for this meeting");
      await db
        .update(schema.abstractBook)
        .set({ status: "draft", updatedAt: new Date() })
        .where(eq(schema.abstractBook.id, book.id));
      const view = await loadBookView(db, editionId);
      if (!view) throw new NotFoundError("book not found");
      return view;
    },
  };
}
