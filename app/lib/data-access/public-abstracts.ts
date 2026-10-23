import { and, eq, inArray, like, or } from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  ABSTRACT_FORMATS,
  ABSTRACT_LEVELS,
  type AbstractFormat,
  type AbstractLevel,
  type CodeSource,
  type EditionStatus,
  type Season,
} from "../vocab";
import { assembleBookAbstracts, inBookOrder } from "./book-model";
import type { DB } from "./core";
import { PROGRAM_PUBLIC_STATUSES } from "./program-model";

// ---------------------------------------------------------------------------
// Public abstract archive. Read-only views over accepted abstracts of editions
// at a public stage (same rule as the public program). title and bodyText are
// stored sanitized HTML rendered verbatim; author names, institutions, and topic
// are plain text escaped at render time. number is the abstract-book numbering.
// ---------------------------------------------------------------------------

interface PublicAbstractAuthor {
  name: string; // "First Last", plain text
  affiliationOrdinals: number[];
  isPresenting: boolean;
  isCorresponding: boolean;
}

interface PublicAbstractAffiliation {
  ordinal: number;
  institution: string; // plain text
  department: string | null;
  city: string | null;
  country: string | null;
}

export interface PublicAbstractSummary {
  number: number; // stable 1..n fallback used when there is no stored code
  code: string | null; // the book code (for example UO1), null if none stored
  codeSource: CodeSource | null; // "printed" or "generated", null when no code
  title: string; // sanitized HTML
  level: AbstractLevel | null;
  format: AbstractFormat | null;
  topic: string | null; // abstract_category name, null for untopiced (orals)
  authors: PublicAbstractAuthor[];
}

export interface PublicAbstractDetail extends PublicAbstractSummary {
  affiliations: PublicAbstractAffiliation[];
  bodyText: string | null; // sanitized HTML
}

export interface PublicEditionSummary {
  slug: string;
  name: string;
  season: Season;
  year: number;
  venueName: string | null;
  city: string | null;
  meetingStartsAt: Date | null;
  meetingEndsAt: Date | null;
}

export interface PublicAbstractListing {
  edition: PublicEditionSummary;
  abstracts: PublicAbstractSummary[];
  topics: string[]; // distinct topics present, in category order
}

export interface PublicAbstractPage {
  edition: PublicEditionSummary;
  abstract: PublicAbstractDetail;
}

export interface PublicMeeting extends PublicEditionSummary {
  status: EditionStatus;
  abstractCount: number;
}

export interface PublicAbstractSearchFilters {
  level?: AbstractLevel;
  format?: AbstractFormat;
  meeting?: string; // edition slug
}

export interface PublicAbstractSearchResult {
  editionSlug: string;
  editionName: string;
  number: number; // 1..n fallback used when there is no stored code
  code: string | null; // the book code, null if none stored
  title: string; // sanitized HTML
  presentingAuthorName: string | null;
  level: AbstractLevel | null;
  format: AbstractFormat | null;
  topic: string | null;
}

// Full public detail for every accepted abstract of an edition, in the abstract
// book numbering (category sortOrder then name, uncategorized last, title-sorted
// within a group, then 1..n). title and bodyText are the stored sanitized HTML;
// author and affiliation text is plain. Reused by the public listing, the
// single-abstract page, and search. Does not gate; callers check the edition
// stage first.
async function buildNumberedAbstracts(
  db: DB,
  editionId: string,
): Promise<Array<{ id: string; detail: PublicAbstractDetail }>> {
  const absRows = await db
    .select()
    .from(schema.abstract)
    .where(
      and(
        eq(schema.abstract.editionId, editionId),
        eq(schema.abstract.status, "accepted"),
      ),
    );
  if (absRows.length === 0) return [];

  const parts = await assembleBookAbstracts(db, absRows.map((a) => a.id));
  const categoryRows = await db
    .select()
    .from(schema.abstractCategory)
    .where(eq(schema.abstractCategory.editionId, editionId))
    .orderBy(schema.abstractCategory.sortOrder, schema.abstractCategory.name);
  const categoryNameById = new Map(categoryRows.map((c) => [c.id, c.name]));
  const ordered = inBookOrder(absRows, categoryRows);

  return ordered.map((row, i) => ({
    id: row.id,
    detail: {
      number: i + 1,
      code: row.code,
      codeSource: row.codeSource,
      title: row.title,
      level: row.level,
      format: row.format,
      topic: row.categoryId
        ? categoryNameById.get(row.categoryId) ?? null
        : null,
      authors: (parts.get(row.id)?.authors ?? []).map((a) => ({
        name: `${a.firstName} ${a.lastName}`.trim(),
        affiliationOrdinals: a.affiliationOrdinals,
        isPresenting: a.isPresenting,
        isCorresponding: a.isCorresponding,
      })),
      affiliations: parts.get(row.id)?.affiliations ?? [],
      bodyText: row.bodyText,
    },
  }));
}

// The public edition summary shape, from a raw edition row.
export function publicEditionSummary(
  ed: typeof schema.edition.$inferSelect,
): PublicEditionSummary {
  return {
    slug: ed.slug,
    name: ed.name,
    season: ed.season,
    year: ed.year,
    venueName: ed.venueName,
    city: ed.city,
    meetingStartsAt: ed.meetingStartsAt,
    meetingEndsAt: ed.meetingEndsAt,
  };
}

// Public abstract archive. All reads are gated to editions at a public stage
// (scheduled, complete, archived), the same rule as the public program. A live
// or in-progress meeting's abstracts stay private: these return null or an
// empty result rather than exposing them.
export function createPublicAbstracts(db: DB) {
  return {
    // The meeting's accepted abstracts, numbered like the book, with the distinct
    // topics present (in category order). Null when the edition is missing or not
    // at a public stage.
    async listForEdition(slug: string): Promise<PublicAbstractListing | null> {
      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.slug, slug),
      });
      if (!ed || !PROGRAM_PUBLIC_STATUSES.includes(ed.status)) return null;
      const items = await buildNumberedAbstracts(db, ed.id);
      const topics: string[] = [];
      for (const { detail } of items) {
        if (detail.topic && !topics.includes(detail.topic)) {
          topics.push(detail.topic);
        }
      }
      const abstracts: PublicAbstractSummary[] = items.map(({ detail }) => ({
        number: detail.number,
        code: detail.code,
        codeSource: detail.codeSource,
        title: detail.title,
        level: detail.level,
        format: detail.format,
        topic: detail.topic,
        authors: detail.authors,
      }));
      return { edition: publicEditionSummary(ed), abstracts, topics };
    },

    // One abstract by its book number within a public-stage edition. Null when
    // the edition is not public or the number does not match an accepted abstract.
    async getOne(
      editionSlug: string,
      number: number,
    ): Promise<PublicAbstractPage | null> {
      if (!Number.isInteger(number) || number < 1) return null;
      const ed = await db.query.edition.findFirst({
        where: eq(schema.edition.slug, editionSlug),
      });
      if (!ed || !PROGRAM_PUBLIC_STATUSES.includes(ed.status)) return null;
      const items = await buildNumberedAbstracts(db, ed.id);
      const found = items.find((x) => x.detail.number === number);
      if (!found) return null;
      return { edition: publicEditionSummary(ed), abstract: found.detail };
    },

    // Free-text search over author name, title, and topic across public-stage
    // editions, with optional level, format, and meeting filters. Every value is
    // bound as a query parameter. Matching ids are then numbered per edition so
    // each result links to its abstract page.
    async search(
      query: string,
      filters: PublicAbstractSearchFilters = {},
    ): Promise<PublicAbstractSearchResult[]> {
      const term = query.trim();
      const conditions = [
        eq(schema.abstract.status, "accepted"),
        inArray(schema.edition.status, [...PROGRAM_PUBLIC_STATUSES]),
      ];
      if (term) {
        const pattern = `%${term}%`;
        conditions.push(
          or(
            like(schema.abstract.title, pattern),
            like(schema.abstractCategory.name, pattern),
            like(schema.author.firstName, pattern),
            like(schema.author.lastName, pattern),
          )!,
        );
      }
      if (filters.level && ABSTRACT_LEVELS.includes(filters.level)) {
        conditions.push(eq(schema.abstract.level, filters.level));
      }
      if (filters.format && ABSTRACT_FORMATS.includes(filters.format)) {
        conditions.push(eq(schema.abstract.format, filters.format));
      }
      if (filters.meeting) {
        conditions.push(eq(schema.edition.slug, filters.meeting));
      }

      // Distinct matching abstract ids with their edition. The author join can
      // multiply rows, so selectDistinct dedupes by the projected columns.
      const rows = await db
        .selectDistinct({
          abstractId: schema.abstract.id,
          editionId: schema.abstract.editionId,
        })
        .from(schema.abstract)
        .innerJoin(
          schema.edition,
          eq(schema.abstract.editionId, schema.edition.id),
        )
        .leftJoin(schema.author, eq(schema.author.abstractId, schema.abstract.id))
        .leftJoin(
          schema.abstractCategory,
          eq(schema.abstract.categoryId, schema.abstractCategory.id),
        )
        .where(and(...conditions))
        .limit(500);
      if (rows.length === 0) return [];

      // Group matched ids by edition, then number each involved edition once so a
      // result can link to its abstract page.
      const matchedByEdition = new Map<string, Set<string>>();
      for (const row of rows) {
        const set = matchedByEdition.get(row.editionId) ?? new Set<string>();
        set.add(row.abstractId);
        matchedByEdition.set(row.editionId, set);
      }
      const editionIds = [...matchedByEdition.keys()];
      const editionRows = await db
        .select({
          id: schema.edition.id,
          slug: schema.edition.slug,
          name: schema.edition.name,
          year: schema.edition.year,
          meetingStartsAt: schema.edition.meetingStartsAt,
        })
        .from(schema.edition)
        .where(inArray(schema.edition.id, editionIds));
      const editionById = new Map(editionRows.map((e) => [e.id, e]));
      const startsBySlug = new Map(
        editionRows.map((e) => [e.slug, e.meetingStartsAt]),
      );

      const results: PublicAbstractSearchResult[] = [];
      for (const editionId of editionIds) {
        const meta = editionById.get(editionId);
        if (!meta) continue;
        const matched = matchedByEdition.get(editionId)!;
        const items = await buildNumberedAbstracts(db, editionId);
        for (const { id, detail } of items) {
          if (!matched.has(id)) continue;
          results.push({
            editionSlug: meta.slug,
            editionName: meta.name,
            number: detail.number,
            code: detail.code,
            title: detail.title,
            presentingAuthorName:
              detail.authors.find((a) => a.isPresenting)?.name ??
              detail.authors[0]?.name ??
              null,
            level: detail.level,
            format: detail.format,
            topic: detail.topic,
          });
        }
      }
      // Order by meetingStartsAt descending (newest first), then by number within edition.
      return results.sort((a, b) => {
        if (a.editionSlug !== b.editionSlug) {
          const aStart = startsBySlug.get(a.editionSlug)?.getTime() ?? 0;
          const bStart = startsBySlug.get(b.editionSlug)?.getTime() ?? 0;
          return bStart - aStart;
        }
        return a.number - b.number;
      });
    },
  };
}
