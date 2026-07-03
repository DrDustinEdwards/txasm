import { SEASON_LABELS, type DocumentCategory, type Season } from "./vocab";

// Public URL structure for the document archive, kept in one place so the index
// and per-document pages agree. Newsletters keep the live path; abstract books
// and programs live under /archive. This is route structure, not identity.
export const CATEGORY_PATHS: Partial<
  Record<DocumentCategory, { basePath: string; title: string }>
> = {
  newsletter: { basePath: "/newsletters", title: "Newsletters" },
  abstract_book: { basePath: "/archive/abstract-books", title: "Abstract books" },
  program: { basePath: "/archive/programs", title: "Programs" },
};

// Map an /archive URL segment to its document category. Newsletters have their
// own top-level route, so they are not part of the generic archive.
export const ARCHIVE_SEGMENTS: Record<string, DocumentCategory> = {
  "abstract-books": "abstract_book",
  programs: "program",
};

// A slim view of a document for the archive list and per-document pages.
export interface ArchiveDoc {
  slug: string;
  title: string;
  season: Season | null;
  year: number | null;
  editor: string | null;
}

// A human subtitle for a document: "Fall 1991" plus the editor when present.
export function documentSubtitle(doc: ArchiveDoc): string {
  const season = doc.season ? SEASON_LABELS[doc.season] : "";
  const when = [season, doc.year ? String(doc.year) : ""]
    .filter(Boolean)
    .join(" ");
  const parts: string[] = [];
  if (when) parts.push(when);
  if (doc.editor) parts.push(`Editor: ${doc.editor}`);
  return parts.join(" · ");
}

// Neighboring slugs within an ordered category list, for Previous and Next.
export function adjacentSlugs(
  list: Array<{ slug: string }>,
  slug: string,
): { prevSlug: string | null; nextSlug: string | null } {
  const index = list.findIndex((d) => d.slug === slug);
  if (index < 0) return { prevSlug: null, nextSlug: null };
  return {
    prevSlug: index > 0 ? list[index - 1].slug : null,
    nextSlug: index < list.length - 1 ? list[index + 1].slug : null,
  };
}
