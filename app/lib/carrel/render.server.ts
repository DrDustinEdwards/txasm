// A page body's render (Prelum, assertSafe on) with its library pictures, and the re-render a changed file needs.
//
// VERSIONS. Every address a page writes for a library picture carries the file's version (`v=`, the first 12
// characters of its bytes' sha256, site-runtime ./image): its sizes, its link to the original and its share image. The
// route caches a versioned address for a year, so a replace, a turn or a revert must move the pages to the new
// version, or a browser keeps the old picture for that year. The page's stored html is what holds the addresses, so
// the media writes call rerenderUsing, which renders each page that shows the file again from its published source.
//
// PLACEHOLDERS. A picture shows site-api's stored placeholder and main color while it loads: Prelum writes them on the
// img (has-lqip, sized by Capsomer's picture.css), and the policy allows data: images for them (security-headers.ts).
import { RefusedError } from "@dustinedwards/site-api";
import { getCarrelMedia, getCarrelPages, type MediaRow } from "../data-access";
import { images, mediaKeyOf, mediaKeysIn, mediaPath } from "../media/images";
import { parseSource } from "./source";

/** A library file's address, versioned: the original with no width, else the size a use asks for. */
export const versionedPath = (row: Pick<MediaRow, "key" | "sha256">) => images.url(mediaPath(row.key), { version: row.sha256 });

/**
 * The library pictures a page body names, sized for the reading column: Prelum's image resolver (the width, height
 * and placeholder the img carries) and its media options (the srcset, the AVIF and WebP sources and the link to the
 * original). A src that is not a library file is refused, which refuses the render.
 */
async function libraryImages(env: Env, body: string) {
  const rows = new Map((await getCarrelMedia(env).many([...mediaKeysIn(body)])).map((row) => [row.key, row]));
  const rowOf = (src: string) => {
    const key = mediaKeyOf(src);
    return key ? rows.get(key) : undefined;
  };
  const attributesOf = (row: MediaRow) =>
    images.attributes(
      { src: mediaPath(row.key), width: row.width, height: row.height, focus: row.focus, version: row.sha256, placeholder: row.placeholder, color: row.color },
      "content",
    );
  return {
    async resolveImage(src: string) {
      const row = rowOf(src);
      if (!row) throw new Error(`${src} is not in the media library. Pages show library pictures only: upload it in Carrel first.`);
      const attrs = attributesOf(row);
      if (!attrs.width || !attrs.height) return null;
      // Only where site-runtime would show one (a JPEG, WebP or AVIF): a PNG or GIF may be clear in places.
      return { width: attrs.width, height: attrs.height, ...(attrs.background && row.placeholder ? { placeholder: row.placeholder } : {}) };
    },
    media: {
      keyOf: mediaKeyOf,
      imageProps(src: string) {
        const row = rowOf(src);
        const attrs = row ? attributesOf(row) : null;
        if (!row || !attrs?.srcset) return null;
        return {
          srcSet: attrs.srcset,
          sizes: attrs.sizes,
          href: versionedPath(row),
          sources: attrs.sources.map((s) => ({ type: s.type, srcSet: s.srcset })),
        };
      },
    },
  };
}

/** Prelum's render without math (`$` is text, so no KaTeX in the upload), loaded on first use so the public routes never parse it. */
export async function renderBody(env: Env, body: string): Promise<{ html: string; renderVersion: string }> {
  const { render } = await import("@drdustinedwards/site-helpers/render/nomath");
  try {
    const { resolveImage, media } = await libraryImages(env, body);
    const out = await render({ file: "page.md", body, resolveImage, options: { assertSafe: true, media } });
    return { html: String(out.html), renderVersion: out.renderVersion };
  } catch (err) {
    throw new RefusedError(err instanceof Error ? err.message : "The page could not be rendered.");
  }
}

/**
 * Renders again each published page whose html or share image names a library file, after the file's bytes changed,
 * from the source its last publish put live: its html and share image then carry the new version and placeholder. The
 * working source and any waiting update are left alone, and nothing a writer did is recorded as a revision. A page
 * that no longer renders is logged and left as it is. Returns how many pages it rendered again.
 */
export async function rerenderUsing(env: Env, key: string): Promise<number> {
  const pages = getCarrelPages(env);
  // The key's path, as an original or a suffixed size (photo.jpg, photo.jpg.webp?w=640), never a longer key.
  const escaped = `/${key}`.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
  const path = new RegExp(`${escaped}(?![A-Za-z0-9_/-])`);
  const named = (text: string) => path.test(text);
  let done = 0;
  for (const page of await pages.list()) {
    if (!page.publishedAt || !named(`${page.html}\n${page.searchFields?.image?.url ?? ""}`)) continue;
    try {
      const published = await pages.publishedSource(page.slug);
      if (published === null) throw new Error("no publish revision holds its live source");
      const { html, renderVersion } = await renderBody(env, parseSource(published).body);
      const image = page.searchFields?.image;
      const [row] = image && mediaKeyOf(image.url) === key ? await getCarrelMedia(env).many([key]) : [];
      const searchFields = image && row ? { ...page.searchFields, image: { ...image, url: versionedPath(row) } } : page.searchFields;
      await pages.rerendered(page.slug, { html, renderVersion, searchFields });
      done += 1;
    } catch (err) {
      console.error(JSON.stringify({ event: "render.media-failed", page: page.slug, key, error: err instanceof Error ? err.message : String(err) }));
    }
  }
  return done;
}
