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
// show the stored html. Pages take no images: the site has no media group for them.
import {
  RefusedError,
  VersionConflictError,
  type ContentSummary,
  type SiteAdapter,
  type WriteResult,
} from "@dustinedwards/site-api";
import { escapeHtml } from "@dustinedwards/site-runtime/html";
import { getCarrelPages, type Page, type PageWrite } from "../data-access";
import { parseSource, type PageSource } from "./source";

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const versionOf = async (p: Pick<Page, "source" | "html">): Promise<string> =>
  (await sha256Hex(JSON.stringify([p.source, p.html]))).slice(0, 32);

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

/** Prelum's render, loaded on first use so the public routes never parse it. */
async function renderBody(body: string): Promise<{ html: string; renderVersion: string }> {
  const { render } = await import("@drdustinedwards/site-helpers/render");
  try {
    const out = await render({
      file: "page.md",
      body,
      resolveImage: () => Promise.reject(new Error("Pages take no images.")),
      options: { assertSafe: true },
    });
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
      ...(await renderBody(parsed.body)),
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
        const { html } = await renderBody(parsed.body);
        const title = escapeHtml(parsed.title);
        return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body><main><h1>${title}</h1><div class="page-prose">${html}</div></main></body></html>`;
      },
    },
  };
}
