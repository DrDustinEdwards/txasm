// The site's side of Carrel's contract (@dustinedwards/site-api): an adapter over the site pages
// in D1 (schema.ts, page), reached only through the data-access layer's Carrel path
// (getCarrelPages), which writes each change with its audit row.
//
// SCOPE. The pages the site has a route for, seeded by migration 0019. Carrel saves drafts and
// publishes; it cannot create a page (no route would show it), take one down (each is a live
// route) or schedule one (the site has no scheduler). Each of those is refused with the reason.
//
// IDS AND VERSIONS. A content id is the page's slug. A version is a hash of the working source and
// the published html, so a save and a publish each give a new one.
//
// RENDER. Prelum's markdown pipeline (assertSafe on), run on publish and preview only; the routes
// show the stored html. A page's pictures come from the media library (media-adapter.server.ts),
// at their /media/ paths: each is sized from the library's index and gets its responsive sizes
// (site-runtime ./image) in the html stored at publish. Any other image is refused, so a page never
// hotlinks or shows a picture the library cannot account for.
import {
  contentVersion,
  RefusedError,
  VersionConflictError,
  type ContentSummary,
  type SiteAdapter,
  type WriteResult,
} from "@dustinedwards/site-api";
import { escapeHtml } from "@dustinedwards/site-runtime/html";
import { notFoundReport } from "@dustinedwards/site-runtime/not-found";
import { getCarrelMedia, getCarrelPages, type Page, type PageWrite } from "../data-access";
import { images, mediaKeyOf, mediaKeysIn, mediaPath } from "../media/images";
import { createCarrelMediaAdapter } from "./media-adapter.server";
import { parseSource, type PageSource } from "./source";

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

const versionOf = (p: Pick<Page, "source" | "html">): Promise<string> => contentVersion([p.source, p.html]);

// A page's path is its slug, and the home page is the site root.
const pathOf = (slug: string) => (slug === "home" ? "/" : `/${slug}`);

function summaryOf(p: Page): ContentSummary {
  return {
    id: p.slug,
    kind: "page",
    title: p.title,
    status: p.publishedAt ? "published" : "draft",
    path: p.publishedAt ? pathOf(p.slug) : null,
    publishAt: null,
    publishedAt: iso(p.publishedAt),
    updatedAt: iso(p.updatedAt),
  };
}

function parse(source: string): PageSource {
  try {
    return parseSource(source);
  } catch (err) {
    throw new RefusedError(err instanceof Error ? err.message : "The source could not be read.");
  }
}

/**
 * The library pictures a page body names, sized for the reading column: Prelum's image resolver (the width and
 * height the img carries) and its media options (the srcset and the AVIF and WebP sources). A src that is not a
 * library file is refused, which refuses the render.
 */
async function libraryImages(env: Env, body: string) {
  const rows = new Map((await getCarrelMedia(env).many([...mediaKeysIn(body)])).map((row) => [row.key, row]));
  const attributesOf = (src: string) => {
    const key = mediaKeyOf(src);
    const row = key ? rows.get(key) : undefined;
    return row ? images.attributes({ src: mediaPath(row.key), width: row.width, height: row.height, focus: row.focus }, "content") : null;
  };
  return {
    async resolveImage(src: string) {
      const attrs = attributesOf(src);
      if (!attrs) throw new Error(`${src} is not in the media library. Pages show library pictures only: upload it in Carrel first.`);
      return attrs.width && attrs.height ? { width: attrs.width, height: attrs.height } : null;
    },
    media: {
      keyOf: mediaKeyOf,
      imageProps(src: string) {
        const attrs = attributesOf(src);
        if (!attrs?.srcset) return null;
        return {
          srcSet: attrs.srcset,
          sizes: attrs.sizes,
          href: mediaPath(mediaKeyOf(src)!),
          sources: attrs.sources.map((s) => ({ type: s.type, srcSet: s.srcset })),
        };
      },
    },
  };
}

/** Prelum's render without math (`$` is text, so no KaTeX in the upload), loaded on first use so the public routes never parse it. */
async function renderBody(env: Env, body: string): Promise<{ html: string; renderVersion: string }> {
  const { render } = await import("@drdustinedwards/site-helpers/render/nomath");
  try {
    const { resolveImage, media } = await libraryImages(env, body);
    const out = await render({ file: "page.md", body, resolveImage, options: { assertSafe: true, media } });
    return { html: String(out.html), renderVersion: out.renderVersion };
  } catch (err) {
    throw new RefusedError(err instanceof Error ? err.message : "The page could not be rendered.");
  }
}

export function createCarrelAdapter(env: Env): SiteAdapter {
  const pages = getCarrelPages(env);

  /** Checks the version, then writes the change and its audit row together. */
  async function write(
    slug: string,
    event: PageWrite["event"],
    changeId: string,
    expectedVersion: string | null,
    build: (current: Page) => Promise<PageWrite["fields"]>,
  ): Promise<WriteResult> {
    const current = await pages.get(slug);
    const now = current ? await versionOf(current) : null;
    if (now !== expectedVersion) throw new VersionConflictError(now);
    if (!current) throw new RefusedError("txasm has no route for a new page; Carrel edits the pages it lists.");
    const fields = await build(current);
    const next = { ...current, ...fields };
    const version = await versionOf(next);
    await pages.write(slug, { event, changeId, version, fields });
    return { id: slug, version, status: summaryOf(next).status, changeId };
  }

  async function publishFields(source: string): Promise<PageWrite["fields"]> {
    const parsed = parse(source);
    return {
      source,
      title: parsed.title,
      description: parsed.description,
      ...(await renderBody(env, parsed.body)),
      publishedAt: new Date(),
    };
  }

  return {
    // Read when Carrel asks, so a request to any other route never depends on it.
    site: {
      id: "txasm",
      name: "Texas Branch ASM",
      get origin() {
        return new URL(env.BETTER_AUTH_URL).origin;
      },
    },

    content: {
      async list({ status, q, cursor, limit }) {
        const needle = q?.toLowerCase();
        const matching = (await pages.list())
          .filter((p) => !needle || p.title.toLowerCase().includes(needle) || p.slug.includes(needle))
          .map(summaryOf)
          .filter((s) => !status || s.status === status);
        const start = Math.max(0, Number(cursor) || 0);
        const next = start + limit < matching.length ? String(start + limit) : null;
        return { items: matching.slice(start, start + limit), nextCursor: next };
      },

      async get(id) {
        const p = await pages.get(id);
        if (!p) return null;
        return { ...summaryOf(p), format: "markdown" as const, source: p.source, version: await versionOf(p) };
      },

      // A draft changes only the working source; the route keeps showing the published page.
      saveDraft: (id, input) =>
        write(id, "save", input.changeId, input.expectedVersion, async () => {
          parse(input.source);
          return { source: input.source };
        }),

      publish: (id, input) =>
        write(id, "publish", input.changeId, input.expectedVersion, (current) =>
          publishFields(input.source ?? current.source),
        ),

      schedule: (id, input) =>
        write(id, "publish", input.changeId, input.expectedVersion, () =>
          Promise.reject(new RefusedError("txasm does not schedule pages. Publish when the page is ready.")),
        ),

      unpublish: (id, input) =>
        write(id, "publish", input.changeId, input.expectedVersion, () =>
          Promise.reject(
            new RefusedError("Every txasm page is a live route, so it stays published. Publish a new version instead."),
          ),
        ),

      async revisions(id) {
        if (!(await pages.get(id))) return null;
        return (await pages.revisions(id)).map((r) => ({
          version: r.version,
          at: r.createdAt.toISOString(),
          author: "carrel",
          message: `${r.event === "publish" ? "Published" : "Saved"} (${r.changeId})`,
        }));
      },

      async revisionSource(id, version) {
        const p = await pages.get(id);
        if (!p) return null;
        if ((await versionOf(p)) === version) return p.source;
        return (await pages.revisions(id)).find((r) => r.version === version)?.source ?? null;
      },
    },

    // The body as the route shows it, in a plain page: an unsaved source has no row to load.
    preview: {
      async render({ source }) {
        const parsed = parse(source);
        const { html } = await renderBody(env, parsed.body);
        const title = escapeHtml(parsed.title);
        return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body><main><h1>${title}</h1><div class="page-prose">${html}</div></main></body></html>`;
      },
    },

    media: createCarrelMediaAdapter(env),
    // The 404s workers/app.ts counts, for Carrel's report.
    insight: { notFound: (options) => notFoundReport(env.DB, options) },
  };
}
