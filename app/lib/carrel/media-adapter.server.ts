// Carrel's media group: the pictures the pages use, as site-api's mediaLibrary over this site's index
// (app/lib/data-access/media.ts) and the UPLOADS bucket. Files are under media/ (the R2 key is the media id, its
// address /<key>, app/routes/media.$.ts). Only what is the site's own lives here; versions, writes, history, lists and
// the change log are the library's.
//
// A file is used where a page's working source or published html names its /media/ path, scanned from the pages
// themselves so the count cannot drift; a scan that cannot run refuses a delete.
//
// Pages store html with each picture's width, height and srcset, so a replace keeps the picture's size
// (replaceKeepsSize) and a quarter turn of a non-square picture is a new file. A stored picture may be shrunk in place
// (the package checks it only gets smaller, same proportions). After any byte change the published pages that show the
// file are rendered again so their addresses carry its new version (render.server.ts).
//
// Old bytes are kept in UPLOADS under media-history/, which /media never serves (only keys under media/, MEDIA_ADDRESS
// in app/lib/media/images.ts). Older copies are media-history/<iso>/<key>; newer ones media-history/<key>/<sha256>.
//
// SVG and PDF are not accepted (the archive keeps PDFs). The covers are inline SVG (app/lib/cover.ts), not files.
import { slugify } from "@drdustinedwards/site-helpers/slug";
import {
  PICTURE_RESIZE,
  pictureLimits,
  extensionFor,
  mediaLibrary,
  type MediaAdapter,
  type MediaKeyInput,
  type MediaUse,
} from "@dustinedwards/site-api";
import { keysAtAddresses } from "@dustinedwards/site-runtime/image";
import { getCarrelMedia, getCarrelPages } from "../data-access";
import { MEDIA_ADDRESS, MEDIA_PREFIX, mediaPath } from "../media/images";
import { suggestFor } from "../media/suggest.server";
import { rerenderUsing } from "./render.server";

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
    const draft = keysAtAddresses(page.source, MEDIA_ADDRESS);
    const live = page.publishedAt ? keysAtAddresses(page.html, MEDIA_ADDRESS) : new Set<string>();
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
    resize: PICTURE_RESIZE,
    replaceKeepsSize: true,
    usage: () => pageUses(env),
    history: { prefix: "media-history/" },
    afterBytes: async (key) => {
      await rerenderUsing(env, key);
    },
    suggest: (picture) => suggestFor(env, picture),
  });
}
