// The book numbering reflow: pure, no I/O. Given a book's entries in final book order, it assigns each its
// presentation code; the data-access layer calls it whenever the arrangement changes and freezes the result on publish.
//
// prefix = LEVEL_CODE_LETTERS[level] + FORMAT_CODE_LETTERS[format] (./vocab, e.g. UP, GO); number = a running count per
// prefix, continuous across sections. An entry with no level or format, or one the chair excluded, gets no code and
// does not consume a number.

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

function codePrefix(level: AbstractLevel | null, format: AbstractFormat | null): string | null {
  if (level === null || format === null) return null;
  return LEVEL_CODE_LETTERS[level] + FORMAT_CODE_LETTERS[format];
}

// Compute each entry's code from its position. Entries MUST already be in final
// book order. Returns a map of entry id to its code, or null for entries that
// carry no code. Excluded and null-level/format entries are skipped and do not
// advance their prefix run.
export function computeBookCodes(entries: readonly NumberingEntry[]): Map<string, string | null> {
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
