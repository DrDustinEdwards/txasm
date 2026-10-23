import { eq, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { computeBookCodes, type NumberingEntry } from "../book-numbering";
import {
  ABSTRACT_FORMAT_LABELS,
  ABSTRACT_LEVEL_LABELS,
  type AbstractFormat,
  type AbstractLevel,
  type PresentationType,
  type Season,
} from "../vocab";
import { extractPlainText } from "../richtext";
import { byIdChunks, type DB } from "./core";

// Book author and affiliation shapes shared by the arranged renderer. Title and
// body fields hold the stored sanitized HTML (em/sup/sub only) and are rendered
// as-is; do not re-parse them.
export interface BookAuthor {
  firstName: string;
  lastName: string;
  isPresenting: boolean;
  isCorresponding: boolean;
  affiliationOrdinals: number[]; // superscript numbers on the author line
}

export interface BookAffiliation {
  ordinal: number;
  institution: string;
  department: string | null;
  city: string | null;
  country: string | null;
}

// ---------------------------------------------------------------------------
// Book builder (new-meeting arrangement). The chair generates a draft from the
// accepted abstracts, drag-drops them within and between sections, and publishes.
// Codes live on book_entry (computed by ./book-numbering), never on abstract.code.
// BookView is the editor's read model; BookRenderData is what the pure arranged
// renderer in ./book consumes on preview and publish.
// ---------------------------------------------------------------------------

interface BookEntryView {
  entryId: string;
  abstractId: string;
  code: string | null; // live in draft, frozen on publish; null for null-level items
  included: boolean;
  title: string; // sanitized HTML
  presentingAuthorName: string | null;
  level: AbstractLevel | null;
  levelLabel: string | null;
  format: AbstractFormat | null; // effective format (decision presentation type, else abstract.format)
  formatLabel: string | null;
}

export interface BookSectionView {
  sectionId: string;
  title: string;
  entries: BookEntryView[];
}

export interface BookView {
  bookId: string;
  editionId: string;
  editionName: string;
  status: "draft" | "published";
  publishedAt: Date | null;
  sections: BookSectionView[];
  includedCount: number;
}

// The desired arrangement the editor persists: sections in order, each listing
// its entry ids in order. Section order is the array order.
export interface BookArrangementInput {
  sections: Array<{ sectionId: string; entryIds: string[] }>;
}

export interface BookRenderEntry {
  code: string | null;
  title: string; // sanitized HTML
  background: string | null;
  methods: string | null;
  results: string | null;
  conclusions: string | null;
  bodyText: string | null;
  presentationType: PresentationType | null;
  authors: BookAuthor[];
  affiliations: BookAffiliation[];
}

export interface BookRenderSection {
  id: string; // anchor id for the TOC target-counter cross-reference
  title: string;
  codeRange: string | null; // e.g. "UP 1-12", or null when the section has no codes
  entries: BookRenderEntry[];
}

export interface BookRenderIndexEntry {
  name: string; // "First Last"
  codes: string[]; // the codes this author appears in, book order
}

export interface BookRenderData {
  edition: {
    name: string;
    season: Season;
    year: number;
    meetingStartsAt: Date | null;
    meetingEndsAt: Date | null;
  };
  status: "draft" | "published";
  sections: BookRenderSection[];
  authorIndex: BookRenderIndexEntry[];
  entryCount: number; // included entries
}

// Starting label for a (level, format, category) section, e.g. "Undergraduate
// Posters" or "Graduate Orals - Medical Microbiology". The chair can rename a
// section after generate; this is only the derived starting label.
export function bookSectionLabel(
  level: AbstractLevel | null,
  format: AbstractFormat | null,
  categoryName: string | null,
): string {
  const levelPart = level ? ABSTRACT_LEVEL_LABELS[level] : null;
  const formatPart = format ? (format === "poster" ? "Posters" : "Orals") : null;
  const base =
    [levelPart, formatPart].filter((p) => p).join(" ") || "Presentations";
  return categoryName ? `${base} - ${categoryName}` : base;
}

// A compact per-section code range for the TOC nicety, e.g. "UP 1-12". A
// section is one (level, format) bucket, so its codes share one prefix; returns
// null when the section has no codes or mixes prefixes.
export function bookSectionCodeRange(codes: Array<string | null>): string | null {
  const parsed = codes
    .filter((c): c is string => Boolean(c))
    .map((c) => {
      const m = c.match(/^([A-Za-z]+)(\d+)$/);
      return m ? { prefix: m[1], n: Number(m[2]) } : null;
    })
    .filter((p): p is { prefix: string; n: number } => p !== null);
  if (parsed.length === 0) return null;
  const prefix = parsed[0].prefix;
  if (!parsed.every((p) => p.prefix === prefix)) return null;
  const nums = parsed.map((p) => p.n);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? `${prefix} ${min}` : `${prefix} ${min}-${max}`;
}

// Abstracts in book order: by category (the categories as given, in their
// sortOrder), uncategorized last, and by title within a group. The public archive
// numbers them this way and the program picker lists them this way.
export function inBookOrder<R extends { categoryId: string | null; title: string }>(
  rows: R[],
  categories: Array<{ id: string }>,
): R[] {
  const byTitle = (a: R, b: R) =>
    extractPlainText(a.title).localeCompare(extractPlainText(b.title), "en", { sensitivity: "base" });
  const group = (categoryId: string | null) => rows.filter((r) => (r.categoryId ?? null) === categoryId).sort(byTitle);
  return [...categories.flatMap((c) => group(c.id)), ...group(null)];
}

// Each abstract's presenting author ("First Last"), or its first author when
// none is marked, or null when it has none.
export async function presentingAuthorNames(db: DB, abstractIds: string[]): Promise<Map<string, string | null>> {
  const rows = await byIdChunks(abstractIds, (part) =>
    db
      .select({
        abstractId: schema.author.abstractId,
        firstName: schema.author.firstName,
        lastName: schema.author.lastName,
        isPresenting: schema.author.isPresenting,
      })
      .from(schema.author)
      .where(inArray(schema.author.abstractId, part))
      .orderBy(schema.author.ordinal),
  );
  return new Map(
    abstractIds.map((id) => {
      const authors = rows.filter((a) => a.abstractId === id);
      const p = authors.find((a) => a.isPresenting) ?? authors[0];
      return [id, p ? `${p.firstName} ${p.lastName}`.trim() || null : null];
    }),
  );
}

// Per-abstract book parts (authors with affiliation ordinals, affiliation
// blocks, decided presentation type, presenting author name) for a set of
// accepted abstracts. Shared by the builder read model, the arranged renderer
// and the public archive.
export async function assembleBookAbstracts(db: DB, abstractIds: string[]): Promise<
  Map<
    string,
    {
      authors: BookAuthor[];
      affiliations: BookAffiliation[];
      presentationType: PresentationType | null;
      presentingAuthorName: string | null;
    }
  >
> {
  const out = new Map<
    string,
    {
      authors: BookAuthor[];
      affiliations: BookAffiliation[];
      presentationType: PresentationType | null;
      presentingAuthorName: string | null;
    }
  >();
  if (abstractIds.length === 0) return out;

  // The links are filtered by abstract id (a join on author), not by the larger
  // set of author ids, so they chunk like everything else here.
  const [authorRows, affiliationRows, links, decisionRows] = await Promise.all([
    byIdChunks(abstractIds, (part) =>
      db.select().from(schema.author).where(inArray(schema.author.abstractId, part)).orderBy(schema.author.ordinal),
    ),
    byIdChunks(abstractIds, (part) =>
      db
        .select()
        .from(schema.affiliation)
        .where(inArray(schema.affiliation.abstractId, part))
        .orderBy(schema.affiliation.ordinal),
    ),
    byIdChunks(abstractIds, (part) =>
      db
        .select({ authorId: schema.authorAffiliation.authorId, affiliationId: schema.authorAffiliation.affiliationId })
        .from(schema.authorAffiliation)
        .innerJoin(schema.author, eq(schema.authorAffiliation.authorId, schema.author.id))
        .where(inArray(schema.author.abstractId, part)),
    ),
    byIdChunks(abstractIds, (part) =>
      db
        .select({ abstractId: schema.decision.abstractId, presentationType: schema.decision.presentationType })
        .from(schema.decision)
        .where(inArray(schema.decision.abstractId, part)),
    ),
  ]);

  const affOrdinalById = new Map(affiliationRows.map((a) => [a.id, a.ordinal]));
  const ordinalsByAuthor = new Map<string, number[]>();
  for (const link of links) {
    const ord = affOrdinalById.get(link.affiliationId);
    if (ord === undefined) continue;
    const list = ordinalsByAuthor.get(link.authorId) ?? [];
    list.push(ord);
    ordinalsByAuthor.set(link.authorId, list);
  }
  const affiliationsByAbstract = new Map<string, BookAffiliation[]>();
  for (const a of affiliationRows) {
    const list = affiliationsByAbstract.get(a.abstractId) ?? [];
    list.push({
      ordinal: a.ordinal,
      institution: a.institution,
      department: a.department,
      city: a.city,
      country: a.country,
    });
    affiliationsByAbstract.set(a.abstractId, list);
  }
  const authorsByAbstract = new Map<string, BookAuthor[]>();
  for (const a of authorRows) {
    const list = authorsByAbstract.get(a.abstractId) ?? [];
    list.push({
      firstName: a.firstName,
      lastName: a.lastName,
      isPresenting: a.isPresenting,
      isCorresponding: a.isCorresponding,
      affiliationOrdinals: (ordinalsByAuthor.get(a.id) ?? []).sort(
        (x, y) => x - y,
      ),
    });
    authorsByAbstract.set(a.abstractId, list);
  }
  const presentationByAbstract = new Map(
    decisionRows.map((d) => [d.abstractId, d.presentationType]),
  );
  for (const id of abstractIds) {
    const authors = authorsByAbstract.get(id) ?? [];
    const presenter = authors.find((a) => a.isPresenting) ?? authors[0];
    out.set(id, {
      authors,
      affiliations: affiliationsByAbstract.get(id) ?? [],
      presentationType: presentationByAbstract.get(id) ?? null,
      presentingAuthorName: presenter
        ? `${presenter.firstName} ${presenter.lastName}`.trim() || null
        : null,
    });
  }
  return out;
}

// Recompute and persist every entry's code for a book, in book order (sections
// by sortOrder, then entries by sortOrder), via the pure ./book-numbering
// reflow. Called after any mutation that can shift a prefix run.
export async function recomputeBookCodes(db: DB, bookId: string): Promise<void> {
  const sections = await db
    .select()
    .from(schema.bookSection)
    .where(eq(schema.bookSection.bookId, bookId))
    .orderBy(schema.bookSection.sortOrder);
  const entries = await db
    .select()
    .from(schema.bookEntry)
    .where(eq(schema.bookEntry.bookId, bookId));
  if (entries.length === 0) return;

  const absRows = await byIdChunks(
    entries.map((e) => e.abstractId),
    (part) =>
      db
        .select({ id: schema.abstract.id, level: schema.abstract.level, format: schema.abstract.format })
        .from(schema.abstract)
        .where(inArray(schema.abstract.id, part)),
  );
  const absById = new Map(absRows.map((a) => [a.id, a]));
  const parts = await assembleBookAbstracts(db, entries.map((e) => e.abstractId));
  const sectionOrder = new Map(sections.map((s, i) => [s.id, i]));

  const ordered = [...entries].sort(
    (a, b) =>
      (sectionOrder.get(a.sectionId) ?? 0) -
        (sectionOrder.get(b.sectionId) ?? 0) || a.sortOrder - b.sortOrder,
  );
  const numbering: NumberingEntry[] = ordered.map((e) => {
    const abs = absById.get(e.abstractId);
    return {
      id: e.id,
      level: abs?.level ?? null,
      format: parts.get(e.abstractId)?.presentationType ?? abs?.format ?? null,
      included: e.included,
    };
  });
  const codes = computeBookCodes(numbering);
  for (const e of ordered) {
    const code = codes.get(e.id) ?? null;
    if (code !== e.code) {
      await db
        .update(schema.bookEntry)
        .set({ code, updatedAt: new Date() })
        .where(eq(schema.bookEntry.id, e.id));
    }
  }
}

// The editor read model for a meeting's book, or null when none exists.
export async function loadBookView(db: DB, editionId: string): Promise<BookView | null> {
  const bookRow = (
    await db
      .select()
      .from(schema.abstractBook)
      .where(eq(schema.abstractBook.editionId, editionId))
      .limit(1)
  )[0];
  if (!bookRow) return null;
  const ed = (
    await db
      .select({ name: schema.edition.name })
      .from(schema.edition)
      .where(eq(schema.edition.id, editionId))
      .limit(1)
  )[0];
  const sections = await db
    .select()
    .from(schema.bookSection)
    .where(eq(schema.bookSection.bookId, bookRow.id))
    .orderBy(schema.bookSection.sortOrder);
  const entries = await db
    .select()
    .from(schema.bookEntry)
    .where(eq(schema.bookEntry.bookId, bookRow.id))
    .orderBy(schema.bookEntry.sortOrder);

  const absIds = entries.map((e) => e.abstractId);
  const absRows = await byIdChunks(absIds, (part) =>
    db
      .select({
        id: schema.abstract.id,
        title: schema.abstract.title,
        level: schema.abstract.level,
        format: schema.abstract.format,
      })
      .from(schema.abstract)
      .where(inArray(schema.abstract.id, part)),
  );
  const absById = new Map(absRows.map((a) => [a.id, a]));
  const parts = await assembleBookAbstracts(db, absIds);

  const entriesBySection = new Map<string, BookEntryView[]>();
  let includedCount = 0;
  for (const e of entries) {
    const abs = absById.get(e.abstractId);
    const meta = parts.get(e.abstractId);
    const level = abs?.level ?? null;
    const format = meta?.presentationType ?? abs?.format ?? null;
    if (e.included) includedCount += 1;
    const view: BookEntryView = {
      entryId: e.id,
      abstractId: e.abstractId,
      code: e.code,
      included: e.included,
      title: abs?.title ?? "",
      presentingAuthorName: meta?.presentingAuthorName ?? null,
      level,
      levelLabel: level ? ABSTRACT_LEVEL_LABELS[level] : null,
      format,
      formatLabel: format ? ABSTRACT_FORMAT_LABELS[format] : null,
    };
    const list = entriesBySection.get(e.sectionId) ?? [];
    list.push(view);
    entriesBySection.set(e.sectionId, list);
  }

  return {
    bookId: bookRow.id,
    editionId,
    editionName: ed?.name ?? "",
    status: bookRow.status,
    publishedAt: bookRow.publishedAt,
    sections: sections.map((s) => ({
      sectionId: s.id,
      title: s.title,
      entries: entriesBySection.get(s.id) ?? [],
    })),
    includedCount,
  };
}
