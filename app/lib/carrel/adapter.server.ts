// The site's side of Carrel's contract (@dustinedwards/site-api): an adapter over the site pages
// in D1 (schema.ts, page), reached only through the data-access layer's Carrel path
// (getCarrelPages), which writes each change with its audit row.
//
// SCOPE. The pages the site has a route for, seeded by migration 0019. Carrel saves drafts,
// publishes and schedules; it cannot create a page (no route would show it) or take one down
// (each is a live route), and the adapter has no rename, trash or delete, so the package answers
// those routes 501 and meta.capabilities leaves them out.
//
// SCHEDULES. Every page is live, so a schedule is site-api's scheduled update (v0.10.0): its own
// source in scheduled_updates (migration 0026), with the page still "published" and the update in
// scheduledUpdate until publish_at. The per-minute cron (workers/app.ts) runs the package's
// runSchedules, which puts the update's source live through `schedules.apply`, recorded under the
// change id that scheduled it, and fires the hooks a Carrel publish fires. A save leaves the update
// waiting (its source replaces the saved one when it runs, which Carrel warns of); a publish drops it.
//
// IDS AND VERSIONS. A content id is the page's slug. A version is a hash of the working source and
// the published html, and the waiting update's time and change id while one waits, so a save, a
// publish and a schedule each give a new one, and a page with nothing waiting keeps the version it
// had before schedules existed.
//
// RENDER. Prelum's markdown pipeline (assertSafe on), run on publish, schedule and preview only; the
// routes show the stored html, and meta says which Prelum render that is. A page's pictures come
// from the media library (media-adapter.server.ts), at their /media/ paths: each is sized from the
// library's index and gets its responsive sizes (site-runtime ./image) in the html stored at
// publish. Any other image is refused, so a page never hotlinks or shows a picture the library
// cannot account for.
import {
  contentVersion,
  NotFoundError,
  previewDocument,
  RefusedError,
  VersionConflictError,
  type ContentAdapter,
  type ContentSummary,
  type ScheduledUpdate,
  type SchedulesAdapter,
  type SiteAdapter,
  type WriteResult,
} from "@dustinedwards/site-api";
import { readKey, SEARCH_FIELDS, splitSource } from "@dustinedwards/site-api/frontmatter";
import { utc } from "@dustinedwards/site-api/schedules";
import { escapeHtml } from "@dustinedwards/site-runtime/html";
import { notFoundReport } from "@dustinedwards/site-runtime/not-found";
import { getCarrelMedia, getCarrelPages, type Page, type PageSearch, type PageWrite } from "../data-access";
import { images, mediaKeyOf, mediaKeysIn, mediaPath } from "../media/images";
import { createCarrelMediaAdapter } from "./media-adapter.server";
import { parseSource, type PageSource } from "./source";

const KIND = "page";

/** What waits on a page, as the contract shows it beside the live version. */
type Waiting = Pick<ScheduledUpdate, "publishAt" | "changeId"> | null;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

const waitingOf = (u: ScheduledUpdate | null): Waiting => (u ? { publishAt: u.publishAt, changeId: u.changeId } : null);

const versionOf = (p: Pick<Page, "source" | "html">, update: Waiting = null): Promise<string> =>
  contentVersion(update ? [p.source, p.html, update.publishAt, update.changeId] : [p.source, p.html]);

// A page's path is its slug, and the home page is the site root.
const pathOf = (slug: string) => (slug === "home" ? "/" : `/${slug}`);

function summaryOf(p: Page, update: Waiting): ContentSummary {
  return {
    id: p.slug,
    kind: KIND,
    title: p.title,
    status: p.publishedAt ? "published" : "draft",
    path: p.publishedAt ? pathOf(p.slug) : null,
    publishAt: null,
    publishedAt: iso(p.publishedAt),
    updatedAt: iso(p.updatedAt),
    scheduledUpdate: update,
  };
}

/** The list's orderings: the dates newest first and titles A to Z unless `dir` says otherwise. */
const ORDER = {
  updated: (p: Page) => p.updatedAt.getTime(),
  published: (p: Page) => p.publishedAt?.getTime() ?? 0,
  title: (p: Page) => p.title,
};

const REVISION_MESSAGES: Record<PageWrite["event"], string> = {
  save: "Saved",
  publish: "Published",
  schedule: "Scheduled an update",
  unschedule: "Canceled the scheduled update",
};

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

/** The search fields as the routes read them: a share image must be a library file, sized from the library's index. */
async function searchFieldsFor(env: Env, search: PageSource["search"]): Promise<PageSearch | null> {
  const out: PageSearch = {};
  if (search.searchTitle.trim()) out.searchTitle = search.searchTitle.trim();
  if (search.image.trim()) {
    const key = mediaKeyOf(search.image);
    const [row] = key ? await getCarrelMedia(env).many([key]) : [];
    if (!row) throw new RefusedError(`${search.image} is not in the media library. A share image is a library picture: upload it in Carrel first.`);
    out.image = { url: mediaPath(row.key), width: row.width, height: row.height, ...(search.imageAlt.trim() ? { alt: search.imageAlt.trim() } : {}) };
  }
  if (search.canonical.trim()) {
    if (!/^https?:\/\//.test(search.canonical.trim())) throw new RefusedError("canonical must be an absolute http(s) address.");
    out.canonical = search.canonical.trim();
  }
  if (search.noindex) out.noindex = true;
  return Object.keys(out).length > 0 ? out : null;
}

export function createCarrelAdapter(
  env: Env,
  options: { renderVersion?: string; stylesheets?: string[] } = {},
): SiteAdapter {
  const pages = getCarrelPages(env);
  const origin = () => new URL(env.BETTER_AUTH_URL).origin;

  type Change = Pick<PageWrite, "fields" | "schedule">;

  /** Checks the version, then writes the change, its schedule change and its audit row together. */
  async function write(
    slug: string,
    event: PageWrite["event"],
    changeId: string,
    expectedVersion: string | null,
    build: (current: Page, update: Waiting) => Promise<Change>,
  ): Promise<WriteResult> {
    const current = await pages.get(slug);
    const update = current ? waitingOf(await pages.scheduled(slug)) : null;
    const now = current ? await versionOf(current, update) : null;
    if (now !== expectedVersion) throw new VersionConflictError(now);
    if (!current) throw new RefusedError("txasm has no route for a new page; Carrel edits the pages it lists.");
    const change = await build(current, update);
    const next = { ...current, ...change.fields };
    const schedule = change.schedule;
    const nextUpdate: Waiting =
      schedule && "put" in schedule
        ? { publishAt: utc(schedule.put.publishAt), changeId: schedule.put.changeId }
        : schedule && "drop" in schedule
          ? null
          : update;
    const version = await versionOf(next, nextUpdate);
    await pages.write(slug, { event, changeId, version, source: next.source, ...change });
    return { id: slug, version, status: summaryOf(next, nextUpdate).status, changeId, scheduledUpdate: nextUpdate };
  }

  async function publishFields(source: string, publishedAt: Date): Promise<NonNullable<PageWrite["fields"]>> {
    const parsed = parse(source);
    return {
      source,
      title: parsed.title,
      description: parsed.description,
      searchFields: await searchFieldsFor(env, parsed.search),
      ...(await renderBody(env, parsed.body)),
      publishedAt,
    };
  }

  // The source goes live at publishAt; it is rendered now too, so a source that cannot go live is refused today
  // rather than failing at its time. Scheduling again replaces the update that was waiting.
  const scheduleUpdate = (id: string, input: { source?: string; publishAt: string; expectedVersion: string; changeId: string }) =>
    write(id, "schedule", input.changeId, input.expectedVersion, async (current) => {
      const source = input.source ?? current.source;
      await publishFields(source, new Date());
      return { schedule: { put: { source, publishAt: input.publishAt, changeId: input.changeId } } };
    });

  const content: ContentAdapter = {
    // kind is always "page"; published compares publishedAt. A page has no tags and no authors.
    filters: ["kind", "published"],
    publishedAtSettable: true,
    searchFields: SEARCH_FIELDS,

    async list(query) {
      const needle = query.q?.toLowerCase();
      const after = query.publishedAfter ? Date.parse(query.publishedAfter) : null;
      const before = query.publishedBefore ? Date.parse(query.publishedBefore) : null;
      const published = (p: Page) => p.publishedAt?.getTime() ?? null;
      const rows = (await pages.list()).filter((p) => {
        const at = published(p);
        return (
          (!query.status || summaryOf(p, null).status === query.status) &&
          (!query.kind || query.kind === KIND) &&
          (after === null || (at !== null && at >= after)) &&
          (before === null || (at !== null && at <= before)) &&
          (!needle || [p.title, p.source].some((t) => t.toLowerCase().includes(needle)))
        );
      });
      const sort = query.sort ?? "updated";
      const dir = query.dir ?? (sort === "title" ? "asc" : "desc");
      const key = ORDER[sort];
      rows.sort((a, b) => {
        const [x, y] = [key(a), key(b)];
        return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * (dir === "asc" ? 1 : -1);
      });
      const start = Math.max(0, Number(query.cursor) || 0);
      const page = rows.slice(start, start + query.limit);
      const items = await Promise.all(
        page.map(async (p) => {
          const update = waitingOf(await pages.scheduled(p.slug));
          return { ...summaryOf(p, update), version: await versionOf(p, update) };
        }),
      );
      const nextCursor = start + query.limit < rows.length ? String(start + query.limit) : null;
      return { items, nextCursor, total: rows.length, sorted: { sort, dir } };
    },

    async get(id) {
      const p = await pages.get(id);
      if (!p) return null;
      const update = waitingOf(await pages.scheduled(id));
      return { ...summaryOf(p, update), format: "markdown" as const, source: p.source, version: await versionOf(p, update) };
    },

    // A draft changes only the working source; the route keeps showing the published page, and an update
    // scheduled on it keeps waiting.
    saveDraft: (id, input) =>
      write(id, "save", input.changeId, input.expectedVersion, async () => {
        parse(input.source);
        return { fields: { source: input.source } };
      }),

    // What goes live is this publish, so an update waiting on the page is dropped and the cron never brings it back.
    publish: (id, input) =>
      write(id, "publish", input.changeId, input.expectedVersion, async (current) => ({
        fields: await publishFields(input.source ?? current.source, input.publishedAt ? new Date(input.publishedAt) : new Date()),
        schedule: { drop: true },
      })),

    // The package sends a live page's schedule to schedules.update; every txasm page is live, so this one hears
    // only an id the site does not hold, which the version check refuses.
    schedule: scheduleUpdate,

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
        message: `${REVISION_MESSAGES[r.event]} (${r.changeId})`,
      }));
    },

    async revisionSource(id, version) {
      const p = await pages.get(id);
      if (!p) return null;
      if ((await versionOf(p, waitingOf(await pages.scheduled(id)))) === version) return p.source;
      return (await pages.revisions(id)).find((r) => r.version === version)?.source ?? null;
    },
  };

  const schedules: SchedulesAdapter = {
    get: (id) => pages.scheduled(id),

    update: scheduleUpdate,

    async cancel(id, input) {
      if (!(await pages.get(id))) throw new NotFoundError();
      return write(id, "unschedule", input.changeId, input.expectedVersion, async (_current, update) => {
        if (!update) throw new RefusedError("Nothing is scheduled for this page.");
        return { schedule: { drop: true } };
      });
    },

    due: ({ now, limit }) => pages.due(now, limit),

    // Only the update that was listed, once its time has come: a cancel, a reschedule or a publish in between wins.
    // Its source becomes the page's, published under the time it was scheduled for.
    async apply(id, due) {
      const update = await pages.scheduled(id);
      const current = await pages.get(id);
      if (due.kind !== "update" || !current || !update) return null;
      if (update.publishAt !== due.publishAt || update.changeId !== due.changeId) return null;
      if (Date.parse(due.publishAt) > due.now.getTime()) return null;
      return write(id, "publish", due.changeId, await versionOf(current, waitingOf(update)), async () => ({
        fields: await publishFields(update.source, new Date(due.publishAt)),
        schedule: { drop: { publishAt: due.publishAt, changeId: due.changeId } },
      }));
    },
  };

  return {
    // Read when Carrel asks, so a request to any other route never depends on it.
    site: {
      id: "txasm",
      name: "Texas Branch ASM",
      get origin() {
        return origin();
      },
    },

    content,
    schedules,
    // The Prelum render a publish stores (each row keeps its own in render_version), named in meta for Carrel's
    // requests; handler.server.ts loads it with the renderer.
    ...(options.renderVersion ? { renderVersion: options.renderVersion } : {}),

    // The body as the route shows it, in the site's own stylesheet: an unsaved source has no row to load. A source
    // with no title still previews (site-api's conformance asks it to); a save still refuses it.
    preview: {
      async render({ source }) {
        const { front, body } = splitSource(source);
        const { html } = await renderBody(env, body);
        const title = readKey(front, "title").trim();
        return previewDocument({
          title: title || "Preview",
          body: `<main>${title ? `<h1>${escapeHtml(title)}</h1>` : ""}<div class="page-prose">${html}</div></main>`,
          stylesheets: options.stylesheets ?? [],
          origin: origin(),
          attributes: { "data-theme": "light", "data-family": "navy", "data-cap-site": "txasm" },
        });
      },
    },

    media: createCarrelMediaAdapter(env),
    // The 404s workers/app.ts counts, for Carrel's report.
    insight: { notFound: (query) => notFoundReport(env.DB, query) },
  };
}
