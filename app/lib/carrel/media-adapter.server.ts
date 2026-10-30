// Carrel's media group (site-api v0.13): the library of pictures the pages use. Files are in the
// UPLOADS bucket under media/ (the R2 key is the media id, and the path /<key> is its address,
// app/routes/media.$.ts); their index is the media table (app/lib/data-access/media.ts).
//
// VERSIONS. A file's version is its row's rev, which every editable write checks and bumps in one
// statement (writeAtRev), so a stale write is a 409 and never a lost update. A write that must touch
// R2 first (focal point, replace, turn, revert) claims the version before any object changes.
//
// USE. A file is used where a page's working source or published html names its /media/ path:
// scanned from the pages themselves (two rows), never recorded beside them, so the count cannot
// drift. A page publishes only library pictures (adapter.server.ts), sized from this index.
//
// SIZE. Pages store their html, with each picture's width, height and srcset, at publish. So a
// replace keeps the picture's size (replaceKeepsSize), a quarter turn of a picture that is not
// square is stored as a new file, and stored pictures are never shrunk in place (no resize pass).
//
// NOT OFFERED: the resize pass (above), and a placeholder or main color (the page CSP allows images
// from 'self' only, so an inline data: placeholder would be blocked). SVG and PDF are not accepted:
// the library is pictures for pages, and the archive keeps the PDFs (admin/documents).
//
// COVERS. The abstract book and program covers are inline SVG (app/lib/cover.ts), not files, and
// nothing here reads or writes them.
import {
  MediaInUseError,
  NotFoundError,
  RefusedError,
  VersionConflictError,
  kindOf,
  orientationOf,
  sha256Hex,
  transformFocus,
  turnsSize,
  LARGE_MEDIA_BYTES,
  type MediaAdapter,
  type MediaDetail,
  type MediaItem,
  type MediaLens,
  type MediaListQuery,
  type MediaResize,
  type MediaRevision,
  type MediaTransformOp,
  type MediaUploaded,
  type MediaUse,
} from "@dustinedwards/site-api";
import { replaceObject, writeFocus, type R2BucketLike } from "@dustinedwards/site-api/r2";
import { editImage } from "@dustinedwards/site-runtime/image";
import { getCarrelMedia, getCarrelPages, type MediaFields, type MediaRow, type MediaWrite } from "../data-access";
import { readEmbedded } from "../media/embedded";
import { MEDIA_PREFIX, mediaKeysIn, mediaPath } from "../media/images";
import { suggestFor } from "../media/suggest.server";

/** Pictures only; each is one the Images binding reads, and none can carry script. */
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};
const LIMITS = { maxBytes: 20 * 1024 * 1024, types: Object.keys(TYPES) };

const LENSES: readonly MediaLens[] = ["unattached", "no-alt", "large", "duplicates", "license-expired", "oversized"];

/** What an upload shrinks to unless it says resize=no: twice the reading column's width, and then some. */
const RESIZE: MediaResize = { maxEdge: 2560, quality: 85 };

/** A turn or mirror re-encodes a lossy picture, so it keeps a high quality. */
const TRANSFORM_QUALITY = 92;

/** What the Images binding re-encodes in its own type. A GIF is left out: it may be animated, and a turn keeps one frame. */
const REENCODED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
type Encoded = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

/** Each transform as editImage's options. A quarter turn is clockwise, as the contract's rotate-90 is. */
const TRANSFORMS: Record<MediaTransformOp, { rotate?: 90 | 180 | 270; flip?: "h" | "v" }> = {
  "rotate-90": { rotate: 90 },
  "rotate-180": { rotate: 180 },
  "rotate-270": { rotate: 270 },
  "flip-h": { flip: "h" },
  "flip-v": { flip: "v" },
};

/** Where the bytes a file no longer has are kept, in UPLOADS beside the library. */
const HISTORY_PREFIX = "media-history/";

const versionOf = (rev: number) => `r${rev}`;

/** The rev a version names, or -1 (which no row holds) for anything this site never answered. */
const revOf = (version: string) => (/^r(0|[1-9]\d{0,15})$/.test(version) ? Number(version.slice(1)) : -1);

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function rowTags(row: MediaRow): string[] {
  try {
    const parsed: unknown = JSON.parse(row.tags);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function itemOf(row: MediaRow, usedCount?: number): MediaItem {
  const url = mediaPath(row.key);
  return {
    id: row.key,
    url,
    filename: row.filename,
    contentType: row.contentType,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    alt: row.alt,
    uploadedAt: iso(row.uploadedAt),
    deletable: true,
    version: versionOf(row.rev),
    tags: rowTags(row),
    trashedAt: iso(row.trashedAt),
    focus: row.focus,
    caption: row.caption,
    ...(usedCount === undefined ? {} : { usedCount }),
    credit: row.credit,
    license: row.license,
    sourceUrl: row.sourceUrl,
    licenseExpires: row.licenseExpires,
    takenAt: row.takenAt,
    downloadUrl: url,
  };
}

/** A write's outcome as the contract's answer or error. */
function answer(write: MediaWrite): { version: string } {
  if (write.ok) return { version: versionOf(write.rev) };
  if (write.reason === "missing") throw new NotFoundError("No such media.");
  throw new VersionConflictError(versionOf(write.rev ?? 0), "The file changed since it was loaded.");
}

/** A short, safe name for a key: the upload's own name in lower case, letters and digits joined by hyphens. */
function slugOf(filename: string): string {
  const stem = filename.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const slug = stem
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "file";
}

/** A new key: media/<year>/<random>-<name>.<ext>. Random, so a later upload never lands on an earlier file's key. */
function newKey(filename: string, contentType: string): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return `${MEDIA_PREFIX}${new Date().getUTCFullYear()}/${random}-${slugOf(filename)}.${TYPES[contentType] ?? "bin"}`;
}

/** A view's bytes as a fresh ArrayBuffer, not `bytes.buffer`, which may be a larger allocation than the view. */
function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** "Name" order: the upload's name, or the key for a file without one. */
const nameOf = (row: MediaRow) => (row.filename ?? row.key).toLowerCase();

export function createCarrelMediaAdapter(env: Env): MediaAdapter {
  const store = getCarrelMedia(env);
  // The binding's `put` takes a wider `onlyIf` than the helpers' narrow interface names; the shapes they use agree.
  const bucket = env.UPLOADS as unknown as R2BucketLike;

  /** Every page's uses of every file, from the pages themselves: the working source, and the html while published. */
  async function pageUses(): Promise<Map<string, MediaUse[]>> {
    const uses = new Map<string, MediaUse[]>();
    for (const page of await getCarrelPages(env).list()) {
      const draft = mediaKeysIn(page.source);
      const live = page.publishedAt ? mediaKeysIn(page.html) : new Set<string>();
      for (const key of new Set([...draft, ...live])) {
        const detail = live.has(key) ? (draft.has(key) ? "the published page and its draft" : "the published page") : "the draft";
        const list = uses.get(key) ?? [];
        list.push({ type: "page", id: page.slug, title: page.title.slice(0, 1000), detail });
        uses.set(key, list);
      }
    }
    return uses;
  }

  /** The uses of one file, or a refusal: a check that could not run never lets a delete through. */
  async function usesOf(key: string): Promise<MediaUse[]> {
    try {
      return (await pageUses()).get(key) ?? [];
    } catch (error) {
      throw new RefusedError(`The pages could not be read, so this file's uses are unknown (${error instanceof Error ? error.message : String(error)}).`);
    }
  }

  async function withUse(rows: MediaRow[]): Promise<MediaItem[]> {
    const uses = await pageUses();
    return rows.map((row) => itemOf(row, uses.get(row.key)?.length ?? 0));
  }

  /** The picture's width and height, read by the Images binding; null when it is missing or cannot read the file. */
  async function measure(bytes: Uint8Array): Promise<{ width: number; height: number } | null> {
    try {
      const info = await env.IMAGES.info(new Response(bufferOf(bytes)).body!);
      return "width" in info && info.width > 0 && info.height > 0 ? { width: info.width, height: info.height } : null;
    } catch {
      return null;
    }
  }

  async function reencode(body: ReadableStream | Uint8Array, edit: { rotate?: 90 | 180 | 270; flip?: "h" | "v"; maxEdge?: number }, format: Encoded, quality: number) {
    const response = await editImage(env.IMAGES, body, { ...edit, format, quality });
    return new Uint8Array(await response.arrayBuffer());
  }

  async function read(id: string): Promise<MediaRow> {
    const row = await store.get(id);
    if (!row) throw new NotFoundError("No such media.");
    return row;
  }

  /** Moves the version before an object changes, so a stale writer is refused before R2 is touched. */
  async function claim(id: string, expectedVersion: string) {
    return answer(await store.writeAtRev(id, {}, revOf(expectedVersion)));
  }

  const write = async (id: string, fields: MediaFields, expectedVersion: string) =>
    answer(await store.writeAtRev(id, fields, revOf(expectedVersion)));

  /** The revision a file with no history has: the bytes it was uploaded with, which are its current ones. */
  const firstOf = (row: MediaRow) => ({
    mediaKey: row.key,
    at: row.uploadedAt,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    reason: row.sourceUrl ? ("import" as const) : ("upload" as const),
    sha256: row.sha256,
  });

  /**
   * New bytes under a file's key as its newest revision, the old ones kept first under media-history/: the one way a
   * stored file's bytes change (replace, turn, revert). The caller has already claimed the version.
   */
  async function swapBytes(row: MediaRow, next: { bytes: Uint8Array; width: number | null; height: number | null; reason: "replace" | "transform" | "revert" }, columns: MediaFields) {
    const current = await env.UPLOADS.get(row.key);
    if (!current) throw new NotFoundError("No such media.");
    const backupKey = `${HISTORY_PREFIX}${new Date().toISOString()}/${row.key}`;
    await env.UPLOADS.put(backupKey, await current.arrayBuffer(), { httpMetadata: current.httpMetadata, customMetadata: current.customMetadata });
    const [latest] = await store.revisions(row.key, 1);
    await store.keepRevision(latest?.id ?? (await store.addRevision(firstOf(row))), backupKey);
    await replaceObject(bucket, row.key, { bytes: next.bytes, contentType: row.contentType });
    const sha256 = await sha256Hex(next.bytes);
    await store.addRevision({ mediaKey: row.key, at: new Date(), bytes: next.bytes.byteLength, width: next.width, height: next.height, reason: next.reason, sha256 });
    await store.follow(row.key, { bytes: next.bytes.byteLength, width: next.width, height: next.height, sha256, ...columns });
  }

  async function fresh(id: string) {
    const row = await store.get(id);
    if (!row) throw new Error(`${id} was written, but its index row cannot be read`);
    return row;
  }

  function matches(row: MediaRow, query: MediaListQuery, twins: Map<string, number>, used: Map<string, MediaUse[]>): boolean {
    if ((query.trashed === "only") !== (row.trashedAt !== null)) return false;
    if (query.tag && !rowTags(row).includes(query.tag)) return false;
    if (query.q) {
      const needle = query.q.toLowerCase();
      const hay = [row.key, row.filename ?? "", row.alt, row.caption, row.credit, ...rowTags(row)].join("\n").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (query.kind && kindOf(row.contentType) !== query.kind) return false;
    if (query.orientation && orientationOf(row.width, row.height) !== query.orientation) return false;
    switch (query.lens) {
      case "unattached":
        return !used.has(row.key);
      case "no-alt":
        return row.alt.trim() === "";
      case "large":
        return row.bytes > LARGE_MEDIA_BYTES;
      case "duplicates":
        return (twins.get(row.sha256) ?? 0) > 1;
      case "license-expired":
        return row.licenseExpires !== null && row.licenseExpires < new Date().toISOString().slice(0, 10);
      case "oversized":
        return Math.max(row.width ?? 0, row.height ?? 0) > RESIZE.maxEdge;
      default:
        return true;
    }
  }

  return {
    limits: LIMITS,
    lenses: LENSES,
    replaceKeepsSize: true,
    usage: true,
    filters: true,
    resize: RESIZE,
    readsEmbedded: true,
    // The package checks every address and each redirect before this fetch runs.
    importFetch: ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)) as typeof fetch,

    async list(query) {
      // The cursor first: a change that lands while the page is read is in the next poll, not lost between them.
      const changeCursor = String(await store.changeCursor());
      const [rows, used] = await Promise.all([store.all(), pageUses()]);
      const twins = new Map<string, number>();
      for (const row of rows) twins.set(row.sha256, (twins.get(row.sha256) ?? 0) + 1);

      const sort = query.sort ?? "added";
      const dir = query.dir ?? (sort === "name" ? "asc" : "desc");
      const sign = dir === "asc" ? 1 : -1;
      const count = (row: MediaRow) => used.get(row.key)?.length ?? 0;
      const by: Record<typeof sort, (a: MediaRow, b: MediaRow) => number> = {
        added: (a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime(),
        name: (a, b) => nameOf(a).localeCompare(nameOf(b)),
        size: (a, b) => a.bytes - b.bytes,
        used: (a, b) => count(a) - count(b),
      };
      const matching = rows
        .filter((row) => matches(row, query, twins, used))
        .sort((a, b) => sign * by[sort](a, b) || a.key.localeCompare(b.key));

      const start = query.cursor && /^[1-9]\d{0,8}$/.test(query.cursor) ? Number(query.cursor) : 0;
      const page = matching.slice(start, start + query.limit);
      return {
        items: page.map((row) => itemOf(row, count(row))),
        nextCursor: start + query.limit < matching.length ? String(start + query.limit) : null,
        total: matching.length,
        sorted: { sort, dir },
        changeCursor,
      };
    },

    async get(id): Promise<MediaDetail | null> {
      const row = await store.get(id);
      if (!row) return null;
      const usedBy = await usesOf(id);
      const twins = (await store.all())
        .filter((other) => other.sha256 === row.sha256 && other.key !== row.key)
        .slice(0, 50)
        .map((other) => ({ id: other.key, filename: other.filename }));
      return { ...itemOf(row, usedBy.length), usedBy, twins };
    },

    async upload(input): Promise<MediaUploaded> {
      // Read before any shrink, which drops the metadata with the pixels.
      const found = readEmbedded(input.bytes, input.contentType);
      let bytes = input.bytes;
      let size = await measure(bytes);
      let resizedFrom: MediaUploaded["resizedFrom"];
      if (input.resize && size && REENCODED.has(input.contentType) && Math.max(size.width, size.height) > RESIZE.maxEdge) {
        resizedFrom = { width: size.width, height: size.height, bytes: input.bytes.byteLength };
        bytes = await reencode(input.bytes, { maxEdge: RESIZE.maxEdge }, input.contentType as Encoded, RESIZE.quality);
        size = await measure(bytes);
      }

      const key = newKey(input.filename, input.contentType);
      const now = new Date();
      const sha256 = resizedFrom ? await sha256Hex(bytes) : (input.sha256 ?? (await sha256Hex(bytes)));
      await env.UPLOADS.put(key, bufferOf(bytes), { httpMetadata: { contentType: input.contentType } });
      const embedded = (["credit", "license", "caption", "takenAt"] as const).filter((field) => found[field]);
      try {
        await store.insert({
          key,
          filename: input.filename.slice(0, 300),
          contentType: input.contentType,
          bytes: bytes.byteLength,
          width: size?.width ?? null,
          height: size?.height ?? null,
          sha256,
          alt: input.alt,
          caption: found.caption ?? "",
          credit: found.credit ?? "",
          license: found.license ?? "",
          takenAt: found.takenAt ?? null,
          sourceUrl: input.sourceUrl ?? null,
          uploadedAt: now,
        });
      } catch (error) {
        // No row, so no file: the object goes too, and the upload can simply be sent again.
        await env.UPLOADS.delete(key);
        throw error;
      }

      if (resizedFrom) {
        // The original, kept beside the library and named in the file's history as the revision the shrink replaced.
        const backupKey = `${HISTORY_PREFIX}${now.toISOString()}/${key}`;
        await env.UPLOADS.put(backupKey, bufferOf(input.bytes), { httpMetadata: { contentType: input.contentType } });
        const reason = input.sourceUrl ? ("import" as const) : ("upload" as const);
        await store.addRevision({ mediaKey: key, at: now, bytes: resizedFrom.bytes, width: resizedFrom.width, height: resizedFrom.height, reason, sha256: input.sha256 ?? (await sha256Hex(input.bytes)), backupKey });
        await store.addRevision({ mediaKey: key, at: now, bytes: bytes.byteLength, width: size?.width ?? null, height: size?.height ?? null, reason: "resize", sha256 });
      }

      return {
        ...itemOf(await fresh(key), 0),
        ...(embedded.length > 0 ? { embedded: [...embedded] } : {}),
        ...(resizedFrom ? { resizedFrom } : {}),
      };
    },

    async delete(id) {
      await read(id);
      const usedBy = await usesOf(id);
      if (usedBy.length > 0) throw new MediaInUseError(usedBy);
      const kept = (await store.revisions(id)).flatMap((r) => (r.backupKey ? [r.backupKey] : []));
      // Row first: an object left behind by a failure is unseen and harmless; a row without its object is a broken page.
      if (!(await store.remove(id))) throw new NotFoundError("No such media.");
      await env.UPLOADS.delete([id, ...kept]);
    },

    setAlt: (id, input) => write(id, { alt: input.alt }, input.expectedVersion),
    setCaption: (id, input) => write(id, { caption: input.caption }, input.expectedVersion),
    setTags: (id, input) => write(id, { tags: JSON.stringify([...input.tags].sort()) }, input.expectedVersion),
    setCredit: (id, input) =>
      write(id, { credit: input.credit, license: input.license, sourceUrl: input.sourceUrl, licenseExpires: input.licenseExpires }, input.expectedVersion),

    // A trashed file keeps its object and address, so a page that uses it is unchanged.
    trash: (id, input) => write(id, { trashedAt: new Date() }, input.expectedVersion),
    restore: (id, input) => write(id, { trashedAt: null }, input.expectedVersion),

    // The object's customMetadata `focus` is what site-runtime ./image crops around; the index keeps the same point.
    async setFocus(id, input) {
      const claimed = await claim(id, input.expectedVersion);
      await writeFocus(bucket, id, input.focus);
      await store.follow(id, { focus: input.focus });
      return claimed;
    },

    async replace(id, input) {
      const row = await read(id);
      const size = await measure(input.bytes);
      if (row.width && row.height && (size?.width !== row.width || size?.height !== row.height)) {
        throw new RefusedError(
          `The new picture is ${size ? `${size.width}x${size.height}` : "unmeasured"}, but this file is ${row.width}x${row.height}, ` +
            "and the pages that use it are sized by that. Upload it as a new file instead.",
        );
      }
      await claim(id, input.expectedVersion);
      await swapBytes(row, { bytes: input.bytes, width: size?.width ?? row.width, height: size?.height ?? row.height, reason: "replace" }, { focus: null });
      // The image route keys its cached sizes by the object's etag (site-runtime ./image), so none is stale.
      return { item: itemOf(await fresh(id)), sizesNeedPurge: false };
    },

    async findByHash(sha256) {
      const row = await store.byHash(sha256);
      return row ? itemOf(row) : null;
    },

    // Through the Images binding, in the picture's own type. A quarter turn of a picture that is not square comes
    // here as a new file (asNewFile), since the pages are sized by it; anything else turns in place.
    async transform(id, input) {
      const row = await read(id);
      if (!REENCODED.has(row.contentType)) {
        throw new RefusedError(`A ${row.contentType} picture is not turned here: a GIF may be animated, and a turn would keep one frame.`);
      }
      const object = await env.UPLOADS.get(id);
      if (!object) throw new NotFoundError("No such media.");
      const bytes = await reencode(object.body, TRANSFORMS[input.op], row.contentType as Encoded, TRANSFORM_QUALITY);
      const swapped = turnsSize(input.op);
      const width = swapped ? row.height : row.width;
      const height = swapped ? row.width : row.height;
      // The focal point moves with the picture rather than being cleared.
      const focus = transformFocus(row.focus, input.op);

      if (input.asNewFile) {
        // The old file stays exactly as it was, so a stale version is refused here rather than claimed.
        if (row.rev !== revOf(input.expectedVersion)) throw new VersionConflictError(versionOf(row.rev), "The file changed since it was loaded.");
        const key = newKey(row.filename ?? id, row.contentType);
        await env.UPLOADS.put(key, bufferOf(bytes), { httpMetadata: { contentType: row.contentType } });
        const { filename, contentType, alt, caption, tags, credit, license, sourceUrl, licenseExpires, takenAt } = row;
        await store.insert({
          key, filename, contentType, alt, caption, tags, credit, license, sourceUrl, licenseExpires, takenAt, focus,
          bytes: bytes.byteLength, width, height, sha256: await sha256Hex(bytes), uploadedAt: new Date(),
        });
        if (focus) await writeFocus(bucket, key, focus);
        return { item: itemOf(await fresh(key)), sizesNeedPurge: false };
      }

      await claim(id, input.expectedVersion);
      await swapBytes(row, { bytes, width, height, reason: "transform" }, { focus });
      // replaceObject dropped the old point with the old bytes; the moved one goes back on the object for ./image.
      if (focus) await writeFocus(bucket, id, focus);
      return { item: itemOf(await fresh(id)), sizesNeedPurge: false };
    },

    async history(id): Promise<MediaRevision[] | null> {
      const row = await store.get(id);
      if (!row) return null;
      const rows = await store.revisions(id);
      const listed = rows.length > 0 ? rows : [{ id: 0, ...firstOf(row) }];
      return listed.map((r, n) => ({
        rev: String(r.id),
        at: r.at.toISOString(),
        bytes: r.bytes,
        width: r.width,
        height: r.height,
        reason: r.reason,
        current: n === 0,
      }));
    },

    // The package has checked that `to` is an earlier revision of this size. Its kept bytes come back as a new
    // revision, so a revert is itself undone by another.
    async revert(id, input) {
      const row = await read(id);
      const revision = (await store.revisions(id)).find((r) => String(r.id) === input.to);
      const kept = revision?.backupKey ? await env.UPLOADS.get(revision.backupKey) : null;
      if (!revision || !kept) throw new NotFoundError("This file has no such earlier version, or its copy is gone.");
      const bytes = new Uint8Array(await kept.arrayBuffer());
      await claim(id, input.expectedVersion);
      await swapBytes(row, { bytes, width: revision.width, height: revision.height, reason: "revert" }, { focus: null });
      return { item: itemOf(await fresh(id)), sizesNeedPurge: false };
    },

    // From the change log the triggers on `media` write: every insert, update and delete of a row.
    async changes({ since, limit }) {
      const head = await store.changeCursor();
      if (!/^(0|[1-9]\d{0,15})$/.test(since) || Number(since) > head) {
        throw new RefusedError("That change cursor is not this site's; reload the library.");
      }
      const changed = await store.changedSince(Number(since), head, limit);
      const more = changed.length > limit;
      const taken = changed.slice(0, limit);
      const rows = new Map((await store.many(taken.map((c) => c.key))).map((row) => [row.key, row]));
      return {
        items: await withUse(taken.flatMap((c) => rows.get(c.key) ?? [])),
        removed: taken.filter((c) => !rows.has(c.key)).map((c) => c.key),
        cursor: String(more ? changed[limit - 1]!.seq : head),
        more,
      };
    },

    // Never applied: Carrel shows them, and an editor accepts each as an alt or tags write.
    async suggest(id) {
      const row = await store.get(id);
      if (!row) return null;
      const object = await env.UPLOADS.get(id);
      if (!object) return null;
      try {
        return await suggestFor({ ...env, AI_GATEWAY_BASE_URL: (env as { AI_GATEWAY_BASE_URL?: string }).AI_GATEWAY_BASE_URL }, object.body);
      } catch (error) {
        throw new RefusedError(`No suggestion was made: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}
