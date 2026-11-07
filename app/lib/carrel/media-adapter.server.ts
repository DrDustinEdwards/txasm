// Carrel's media group: the library of pictures the pages use, as site-api's mediaLibrary (v0.24.0) over this site's
// index (app/lib/data-access/media.ts, its MediaLibraryStore) and the UPLOADS bucket. Files are under media/ (the R2
// key is the media id, and the path /<key> is its address, app/routes/media.$.ts). This file keeps only what is the
// site's own; the versions, writes, history, lists and change log are the library's.
//
// USE. A file is used where a page's working source or published html names its /media/ path:
// scanned from the pages themselves, never recorded beside them, so the count cannot drift. A scan
// that cannot run refuses a delete. A page publishes only library pictures (adapter.server.ts), sized from this index.
//
// SIZE. Pages store their html, with each picture's width, height and srcset, at publish. So a replace keeps the
// picture's size (replaceKeepsSize) and a quarter turn of a picture that is not square is stored as a new file. Since
// site-api v0.22.0 a stored picture may still be shrunk in place (the resize pass): the package checks the shrink keeps
// its proportions and only makes it smaller, the address carries no size, and the pages that show it are rendered again.
//
// HISTORY. The bytes a file no longer has are kept in UPLOADS under media-history/, which the /media route never serves
// (it serves only keys under media/, app/lib/media/images.ts mediaKeyOf). Copies made before v0.24.0 are at
// media-history/<iso>/<key>, named by their revision rows; newer ones at media-history/<key>/<sha256>.
//
// AFTER A BYTE CHANGE (replace, turn in place, revert, shrink), the published pages that show the file are rendered
// again, so their addresses carry its new version (render.server.ts).
//
// NOT ACCEPTED: SVG and PDF. The library is pictures for pages, and the archive keeps the PDFs (admin/documents).
//
// COVERS. The abstract book and program covers are inline SVG (app/lib/cover.ts), not files, and
// nothing here reads or writes them.
import { slugify } from "@drdustinedwards/site-helpers/slug";
import {
  pictureLimits,
  extensionFor,
  mediaLibrary,
  type MediaAdapter,
  type MediaKeyInput,
  type MediaUse,
} from "@dustinedwards/site-api";
import { getCarrelMedia, getCarrelPages } from "../data-access";
import { MEDIA_PREFIX, mediaKeysIn, mediaPath } from "../media/images";
import { suggestFor } from "../media/suggest.server";
import { rerenderUsing } from "./render.server";

/** What an upload shrinks to unless it says resize=no: twice the reading column's width, and then some. */
const RESIZE = { maxEdge: 2560, quality: 85 };

/** A new key: media/<year>/<random>-<name>.<ext>. Random, so a later upload never lands on an earlier file's key. */
function newKey(file: MediaKeyInput): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const name = slugify(file.filename.replace(/\.[A-Za-z0-9]{1,5}$/, ""), { max: 60 }) || "file";
  return `${MEDIA_PREFIX}${file.at.slice(0, 4)}/${random}-${name}.${extensionFor(file.contentType, file.filename)}`;
}

/** Every page's uses of every file, from the pages themselves: the working source, and the html while published. */
async function pageUses(env: Env): Promise<Map<string, MediaUse[]>> {
  const uses = new Map<string, MediaUse[]>();
  for (const page of await getCarrelPages(env).list()) {
    const draft = mediaKeysIn(page.source);
    const live = page.publishedAt ? mediaKeysIn(page.html) : new Set<string>();
    for (const key of new Set([...draft, ...live])) {
      const detail = live.has(key)
        ? draft.has(key)
          ? "the published page and its draft"
          : "the published page"
        : "the draft";
      const list = uses.get(key) ?? [];
      list.push({ type: "page", id: page.slug, title: page.title.slice(0, 1000), detail });
      uses.set(key, list);
    }
  }
  return uses;
}

export function createCarrelMediaAdapter(env: Env): MediaAdapter {
  return mediaLibrary({
    store: getCarrelMedia(env).library,
    bucket: env.UPLOADS,
    images: env.IMAGES,
    limits: pictureLimits(),
    url: mediaPath,
    key: newKey,
    resize: RESIZE,
    replaceKeepsSize: true,
    usage: () => pageUses(env),
    history: { prefix: "media-history/" },
    afterBytes: async (key) => {
      await rerenderUsing(env, key);
    },
    suggest: (picture) =>
      suggestFor(
        {
          ...env,
          AI_GATEWAY_BASE_URL: (env as { AI_GATEWAY_BASE_URL?: string }).AI_GATEWAY_BASE_URL,
        },
        picture,
      ),
  });
}
