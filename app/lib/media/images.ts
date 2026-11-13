// The media library's addresses and responsive sizes. A library file's key is its R2 key in the
// UPLOADS bucket, always under media/, and its address is that key as a path (/media/...), served
// by app/routes/media.$.ts. Every way a page shows a library picture is one site-runtime
// defineImages use, so a page never asks /media for a size the route would refuse.
//
// Not for covers: the abstract book and program covers are inline SVG (app/lib/cover.ts), drawn
// into the print document, and never pass through the library or this route.
import { defineImages, type AddressOptions } from "@dustinedwards/site-runtime/image";
import { SITE_ORIGIN } from "../site-meta";

export const MEDIA_PREFIX = "media/";

/**
 * How page content names a library file (site-runtime ./image keyOfAddress and keysAtAddresses): /media/<path> on this
 * site, or txasm.org's own absolute URL, is the key media/<path>, read as the /media route reads it.
 */
export const MEDIA_ADDRESS: AddressOptions = {
  origins: [SITE_ORIGIN],
  keyPrefix: MEDIA_PREFIX,
  within: MEDIA_PREFIX,
};

export const images = defineImages({
  uses: {
    // A picture in a page Carrel edits: the 48rem (768px) reading column (Capsomer's .cap-column data-width="reading").
    content: { layout: "constrained", width: 768 },
  },
});

/** The path a library key is served at. */
export const mediaPath = (key: string) => `/${key}`;
