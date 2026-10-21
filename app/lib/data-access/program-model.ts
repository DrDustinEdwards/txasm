import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { extractPlainText } from "../richtext";
import {
  type EditionStatus,
  PROGRAM_ITEM_KINDS,
  type ProgramItemKind,
} from "../vocab";
import { type DB, ValidationError } from "./core";
import type { SpeakerPublic, SponsorPublic } from "./speakers-sponsors";

// ---------------------------------------------------------------------------
// Program (schedule) types. Sessions hold items; an item is either an accepted
// abstract or a custom entry. Resolved shapes carry what both the admin builder
// and the public view need; titles are stored sanitized HTML, plain text fields
// are escaped at render time.
// ---------------------------------------------------------------------------

export interface ProgramSessionInput {
  editionId: string;
  title: string;
  sessionDate?: Date | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  location?: string | null;
  moderator?: string | null;
}

export interface ProgramSessionPatch {
  title?: string;
  sessionDate?: Date | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  location?: string | null;
  moderator?: string | null;
}

// The ProgramItemKind vocabulary lives in ./vocab (imported above). Validate a
// raw kind string against it before writing.
export function assertKind(kind: string): ProgramItemKind {
  if (!PROGRAM_ITEM_KINDS.includes(kind as ProgramItemKind)) {
    throw new ValidationError("Choose a valid item kind.");
  }
  return kind as ProgramItemKind;
}

export interface ProgramItemPatch {
  kind?: ProgramItemKind;
  customTitle?: string;
  note?: string | null;
  startsAt?: Date | null;
}

interface ProgramItemResolved {
  id: string;
  kind: ProgramItemKind;
  sortOrder: number;
  startsAt: Date | null;
  note: string | null;
  abstractId: string | null;
  abstractCode: string | null; // book_entry.code from the published book; null until publish
  abstractTitle: string | null; // sanitized HTML
  presentingAuthorName: string | null;
  speakerId: string | null;
  speakerName: string | null; // plain text
  speakerTalkTitle: string | null; // plain text
  customTitle: string | null; // plain text
}

export interface ProgramSessionResolved {
  id: string;
  title: string;
  sessionDate: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
  moderator: string | null; // plain text, escaped at render time
  sortOrder: number;
  items: ProgramItemResolved[];
}

export interface ProgramAbstractOption {
  abstractId: string;
  code: string | null; // book_entry.code from the published book, null until publish
  title: string; // sanitized HTML
  presentingAuthorName: string | null;
}

// A concurrent group of sessions: one session on its own, or several running at
// the same time as parallel tracks. The public program renders each group as a
// row of tracks so overlapping sessions are not flattened into one timeline.
interface ProgramTrackGroup {
  concurrent: boolean;
  sessions: ProgramSessionResolved[];
}

export interface ProgramDay {
  key: string; // yyyy-mm-dd, or "no-date" for sessions with no date
  date: Date | null;
  groups: ProgramTrackGroup[];
}

export interface PublicProgram {
  days: ProgramDay[];
  sponsors: SponsorPublic[];
  speakers: SpeakerPublic[];
}

// The chair/admin builder view of the schedule: the same day-and-concurrency
// grouping the public program uses, plus the meeting date range so the builder
// can offer a day tab for every meeting day even before a session exists on it.
export interface ProgramSchedule {
  days: ProgramDay[];
  meetingStartsAt: Date | null;
  meetingEndsAt: Date | null;
}

// Everything the printable program document needs, assembled by
// program.getProgramData and turned into HTML by the pure renderProgramBook in
// ./program-book. Front matter comes from the edition and platform settings;
// title and bio fields hold stored sanitized HTML rendered verbatim, plain text
// (rooms, moderators, names) is escaped by the renderer.
export interface ProgramBookData {
  meeting: {
    name: string;
    meetingStartsAt: Date | null;
    meetingEndsAt: Date | null;
    venueName: string | null;
    city: string | null;
    orgName: string;
    orgFullName: string;
    shortName: string;
  };
  days: ProgramDay[];
  speakers: SpeakerPublic[];
  sponsors: SponsorPublic[];
}

// Group resolved sessions by day, then within a day into concurrent track
// groups. Sessions with overlapping [startsAt, endsAt) run in parallel; sessions
// with no time each stand alone. Days are chronological with the no-date bucket
// last, and parallel tracks within a group are ordered by location.
export function groupSessionsIntoDays(
  sessions: ProgramSessionResolved[],
): ProgramDay[] {
  const byDay = new Map<
    string,
    { date: Date | null; sessions: ProgramSessionResolved[] }
  >();
  for (const s of sessions) {
    const d = s.sessionDate ?? s.startsAt ?? null;
    const key = d ? d.toISOString().slice(0, 10) : "no-date";
    const bucket = byDay.get(key) ?? { date: d, sessions: [] };
    bucket.sessions.push(s);
    byDay.set(key, bucket);
  }

  const keys = [...byDay.keys()].sort((a, b) => {
    if (a === "no-date") return 1;
    if (b === "no-date") return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  return keys.map((key) => {
    const day = byDay.get(key)!;
    const sorted = [...day.sessions].sort((a, b) => {
      const at = a.startsAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = b.startsAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return at - bt || a.sortOrder - b.sortOrder;
    });

    const groups: ProgramTrackGroup[] = [];
    let current: ProgramSessionResolved[] | null = null;
    let groupEnd = Number.NEGATIVE_INFINITY;
    for (const s of sorted) {
      const start = s.startsAt?.getTime() ?? null;
      const end = s.endsAt?.getTime() ?? start;
      if (current && start !== null && start < groupEnd) {
        current.push(s);
        if (end !== null && end > groupEnd) groupEnd = end;
      } else {
        current = [s];
        groups.push({ concurrent: false, sessions: current });
        groupEnd = end ?? Number.NEGATIVE_INFINITY;
      }
    }

    for (const g of groups) {
      g.concurrent = g.sessions.length > 1;
      if (g.concurrent) {
        g.sessions.sort(
          (a, b) =>
            (a.location ?? "").localeCompare(b.location ?? "") ||
            a.sortOrder - b.sortOrder,
        );
      }
    }

    return { key, date: day.date, groups };
  });
}

// Edition stages at which the program is public. scheduled and complete are the
// active late stages; archived meetings keep a public program for the archive
// (CLAUDE.md: keep historical editions queryable).
export const PROGRAM_PUBLIC_STATUSES: readonly EditionStatus[] = [
  "scheduled",
  "complete",
  "archived",
];

// Presentation codes from the edition's published abstract book, keyed by
// abstract id. Empty until the book is published: the program never computes
// its own numbering, it only mirrors book_entry.code (the board number for a
// poster, the speaking order for an oral). Draft books stay invisible here, so
// rearranging before publish never shows a code that could still change.
export async function publishedBookCodes(
  db: DB,
  editionId: string,
): Promise<Map<string, string>> {
  const codes = new Map<string, string>();
  const book = (
    await db
      .select({
        id: schema.abstractBook.id,
        status: schema.abstractBook.status,
      })
      .from(schema.abstractBook)
      .where(eq(schema.abstractBook.editionId, editionId))
      .limit(1)
  )[0];
  if (!book || book.status !== "published") return codes;
  const entries = await db
    .select({
      abstractId: schema.bookEntry.abstractId,
      code: schema.bookEntry.code,
      included: schema.bookEntry.included,
    })
    .from(schema.bookEntry)
    .where(eq(schema.bookEntry.bookId, book.id));
  for (const e of entries) {
    if (e.included && e.code) codes.set(e.abstractId, e.code);
  }
  return codes;
}

// Accepted abstracts for an edition in the book's default order (category
// sortOrder then name, uncategorized last, title-sorted within a group). Used
// to order the add-to-session picker; it carries no number of its own, the
// displayed code always comes from publishedBookCodes.
export async function acceptedAbstractsInBookOrder(
  db: DB,
  editionId: string,
): Promise<
  Array<{
    abstractId: string;
    title: string;
    presentingAuthorName: string | null;
  }>
> {
  const absRows = await db
    .select({
      id: schema.abstract.id,
      title: schema.abstract.title,
      categoryId: schema.abstract.categoryId,
    })
    .from(schema.abstract)
    .where(
      and(
        eq(schema.abstract.editionId, editionId),
        eq(schema.abstract.status, "accepted"),
      ),
    );
  if (absRows.length === 0) return [];

  const ids = absRows.map((a) => a.id);
  const authorRows = await db
    .select({
      abstractId: schema.author.abstractId,
      firstName: schema.author.firstName,
      lastName: schema.author.lastName,
      isPresenting: schema.author.isPresenting,
    })
    .from(schema.author)
    .where(inArray(schema.author.abstractId, ids))
    .orderBy(schema.author.ordinal);

  const categoryRows = await db
    .select()
    .from(schema.abstractCategory)
    .where(eq(schema.abstractCategory.editionId, editionId))
    .orderBy(schema.abstractCategory.sortOrder, schema.abstractCategory.name);

  const authorsByAbstract = new Map<
    string,
    Array<{ firstName: string; lastName: string; isPresenting: boolean }>
  >();
  for (const a of authorRows) {
    const list = authorsByAbstract.get(a.abstractId) ?? [];
    list.push({
      firstName: a.firstName,
      lastName: a.lastName,
      isPresenting: a.isPresenting,
    });
    authorsByAbstract.set(a.abstractId, list);
  }
  function presentingName(abstractId: string): string | null {
    const authors = authorsByAbstract.get(abstractId) ?? [];
    if (authors.length === 0) return null;
    const presenting = authors.find((x) => x.isPresenting) ?? authors[0];
    return `${presenting.firstName} ${presenting.lastName}`.trim() || null;
  }

  const rowsByCategory = new Map<string | null, typeof absRows>();
  for (const row of absRows) {
    const key = row.categoryId ?? null;
    const list = rowsByCategory.get(key) ?? [];
    list.push(row);
    rowsByCategory.set(key, list);
  }
  const byTitle = (
    a: (typeof absRows)[number],
    b: (typeof absRows)[number],
  ) =>
    extractPlainText(a.title).localeCompare(extractPlainText(b.title), "en", {
      sensitivity: "base",
    });

  const ordered: typeof absRows = [];
  for (const cat of categoryRows) {
    const rows = rowsByCategory.get(cat.id);
    if (rows && rows.length > 0) ordered.push(...[...rows].sort(byTitle));
  }
  const uncategorized = rowsByCategory.get(null);
  if (uncategorized && uncategorized.length > 0) {
    ordered.push(...[...uncategorized].sort(byTitle));
  }

  return ordered.map((row) => ({
    abstractId: row.id,
    title: row.title,
    presentingAuthorName: presentingName(row.id),
  }));
}

// Turn raw session and item rows into the resolved shape the builder and the
// public view render. Abstract items get their presentation code from the
// published book's book_entry.code (absent until the book is published) and
// their title and presenting author from a direct fetch, so an item whose
// abstract is no longer accepted still shows a title (with a null code).
async function resolveProgram(
  db: DB,
  editionId: string,
  sessions: Array<typeof schema.programSession.$inferSelect>,
  items: Array<typeof schema.programItem.$inferSelect>,
): Promise<ProgramSessionResolved[]> {
  const codeById = await publishedBookCodes(db, editionId);

  // Invited-speaker items: resolve name and talk title from a direct fetch, so
  // an item whose speaker was later removed (speaker_id set null) still renders
  // by its kind label.
  const speakerRefIds = [
    ...new Set(
      items.map((i) => i.speakerId).filter((x): x is string => x !== null),
    ),
  ];
  const speakerNameById = new Map<string, string>();
  const speakerTalkById = new Map<string, string | null>();
  if (speakerRefIds.length > 0) {
    const speakerRows = await db
      .select({
        id: schema.invitedSpeaker.id,
        name: schema.invitedSpeaker.name,
        talkTitle: schema.invitedSpeaker.talkTitle,
      })
      .from(schema.invitedSpeaker)
      .where(inArray(schema.invitedSpeaker.id, speakerRefIds));
    for (const s of speakerRows) {
      speakerNameById.set(s.id, s.name);
      speakerTalkById.set(s.id, s.talkTitle);
    }
  }

  const refIds = [
    ...new Set(
      items
        .map((i) => i.abstractId)
        .filter((x): x is string => x !== null),
    ),
  ];
  const titleById = new Map<string, string>();
  const presentingById = new Map<string, string | null>();
  if (refIds.length > 0) {
    const absRows = await db
      .select({ id: schema.abstract.id, title: schema.abstract.title })
      .from(schema.abstract)
      .where(inArray(schema.abstract.id, refIds));
    for (const a of absRows) titleById.set(a.id, a.title);

    const authorRows = await db
      .select({
        abstractId: schema.author.abstractId,
        firstName: schema.author.firstName,
        lastName: schema.author.lastName,
        isPresenting: schema.author.isPresenting,
      })
      .from(schema.author)
      .where(inArray(schema.author.abstractId, refIds))
      .orderBy(schema.author.ordinal);
    const authorsByAbstract = new Map<
      string,
      Array<{ firstName: string; lastName: string; isPresenting: boolean }>
    >();
    for (const a of authorRows) {
      const list = authorsByAbstract.get(a.abstractId) ?? [];
      list.push({
        firstName: a.firstName,
        lastName: a.lastName,
        isPresenting: a.isPresenting,
      });
      authorsByAbstract.set(a.abstractId, list);
    }
    for (const id of refIds) {
      const authors = authorsByAbstract.get(id) ?? [];
      const p = authors.find((x) => x.isPresenting) ?? authors[0];
      presentingById.set(
        id,
        p ? `${p.firstName} ${p.lastName}`.trim() || null : null,
      );
    }
  }

  const itemsBySession = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsBySession.get(item.sessionId) ?? [];
    list.push(item);
    itemsBySession.set(item.sessionId, list);
  }

  return [...sessions]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({
      id: s.id,
      title: s.title,
      sessionDate: s.sessionDate,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      location: s.location,
      moderator: s.moderator,
      sortOrder: s.sortOrder,
      items: (itemsBySession.get(s.id) ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          id: item.id,
          kind: item.kind,
          sortOrder: item.sortOrder,
          startsAt: item.startsAt,
          note: item.note,
          abstractId: item.abstractId,
          abstractCode: item.abstractId
            ? codeById.get(item.abstractId) ?? null
            : null,
          abstractTitle: item.abstractId
            ? titleById.get(item.abstractId) ?? null
            : null,
          presentingAuthorName: item.abstractId
            ? presentingById.get(item.abstractId) ?? null
            : null,
          speakerId: item.speakerId,
          speakerName: item.speakerId
            ? speakerNameById.get(item.speakerId) ?? null
            : null,
          speakerTalkTitle: item.speakerId
            ? speakerTalkById.get(item.speakerId) ?? null
            : null,
          customTitle: item.customTitle,
        })),
    }));
}

// An edition's sessions in order, each with its items in order, resolved. No
// sessions is an empty program, without the item and book-code reads.
export async function loadResolvedProgram(
  db: DB,
  editionId: string,
): Promise<ProgramSessionResolved[]> {
  const sessions = await db
    .select()
    .from(schema.programSession)
    .where(eq(schema.programSession.editionId, editionId))
    .orderBy(schema.programSession.sortOrder);
  if (sessions.length === 0) return [];
  const items = await db
    .select()
    .from(schema.programItem)
    .where(
      inArray(
        schema.programItem.sessionId,
        sessions.map((s) => s.id),
      ),
    )
    .orderBy(schema.programItem.sortOrder);
  return resolveProgram(db, editionId, sessions, items);
}

// The invited speakers and sponsors of an edition, in display order, as the
// public program and the printable program show them.
export function listEditionSpeakers(db: DB, editionId: string) {
  return db
    .select({
      id: schema.invitedSpeaker.id,
      name: schema.invitedSpeaker.name,
      affiliation: schema.invitedSpeaker.affiliation,
      role: schema.invitedSpeaker.role,
      talkTitle: schema.invitedSpeaker.talkTitle,
      bio: schema.invitedSpeaker.bio,
    })
    .from(schema.invitedSpeaker)
    .where(eq(schema.invitedSpeaker.editionId, editionId))
    .orderBy(schema.invitedSpeaker.sortOrder, schema.invitedSpeaker.name);
}

export function listEditionSponsors(db: DB, editionId: string) {
  return db
    .select({
      id: schema.sponsor.id,
      name: schema.sponsor.name,
      tier: schema.sponsor.tier,
      url: schema.sponsor.url,
      logoR2Key: schema.sponsor.logoR2Key,
    })
    .from(schema.sponsor)
    .where(eq(schema.sponsor.editionId, editionId))
    .orderBy(schema.sponsor.sortOrder, schema.sponsor.name);
}
