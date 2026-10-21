// The book numbering reflow. Pure and deterministic, no I/O: given a book's
// entries in final book order (section order, then position within section), it
// assigns each entry its presentation code. The data-access layer calls this to
// (re)assign codes whenever the arrangement changes, and freezes the result on
// publish.
//
// The scheme is the prefix convention (3 of the 4 archived books use it), whose
// letters live in ./vocab so nothing is hardcoded here:
//   prefix = LEVEL_CODE_LETTERS[level] + FORMAT_CODE_LETTERS[format]  (e.g. UP, GO)
//   number = a running count PER PREFIX, continuous across sections in book order
// Posters and orals are separate prefixes, so they number independently (UP board
// numbers, UO speaking order), exactly as the archive shows. An entry with no
// level or no format, or one the chair excluded, gets no code and does NOT consume
// a number (v1 exclude behavior; the withdrawn-placeholder gap convention is a
// deferred option per the book-builder spec).

import {
  FORMAT_CODE_LETTERS,
  LEVEL_CODE_LETTERS,
  type AbstractFormat,
  type AbstractLevel,
} from "./vocab";

export interface NumberingEntry {
  id: string;
  level: AbstractLevel | null;
  format: AbstractFormat | null;
  included: boolean;
}

// The prefix for an entry, or null when it carries no code (missing level/format).
function codePrefix(
  level: AbstractLevel | null,
  format: AbstractFormat | null,
): string | null {
  if (level === null || format === null) return null;
  return LEVEL_CODE_LETTERS[level] + FORMAT_CODE_LETTERS[format];
}

// Compute each entry's code from its position. Entries MUST already be in final
// book order. Returns a map of entry id to its code, or null for entries that
// carry no code. Excluded and null-level/format entries are skipped and do not
// advance their prefix run.
export function computeBookCodes(
  entries: readonly NumberingEntry[],
): Map<string, string | null> {
  const runningByPrefix = new Map<string, number>();
  const codes = new Map<string, string | null>();

  for (const entry of entries) {
    const prefix = entry.included ? codePrefix(entry.level, entry.format) : null;
    if (prefix === null) {
      codes.set(entry.id, null);
      continue;
    }
    const next = (runningByPrefix.get(prefix) ?? 0) + 1;
    runningByPrefix.set(prefix, next);
    codes.set(entry.id, `${prefix}${next}`);
  }

  return codes;
}
