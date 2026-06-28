# CLAUDE.md — txasm

Engineering conventions for this repo. Read this before writing code.

## What this is

txasm.org: a conference and abstract-management platform for the Texas Branch of the American Society for Microbiology, replacing the paid Oxford Abstracts service and the old WordPress site. It runs the full lifecycle of a meeting twice a year: registration and payment, abstract submission and editing, reviewer invitation and rubric scoring, accept/reject decisions, the program schedule, and an auto-generated abstract book PDF. Solo-maintained. Each meeting is an edition; the same code runs every meeting forever. The canonical what-and-why is the build kickoff in the project vault; this file is the how.

## Stack (fixed)

- React Router v8 (framework mode) + React 19 + TypeScript.
- Vite with the official Cloudflare plugin (@cloudflare/vite-plugin). The dev server runs in workerd, so local dev mirrors production.
- Cloudflare Workers for compute. Cloudflare D1 (SQLite) for data via Drizzle ORM. Cloudflare R2 for uploads (figures, camera-ready files, generated books). Cloudflare KV for sessions and cache. Cron Triggers for deadline jobs and reminders. Browser Rendering for the book PDF.
- Better Auth on D1/Drizzle, magic-link sign-in, no Google requirement. Sessions live in KV via Better Auth secondary storage.
- Stripe Checkout plus webhook for registration payments. Resend (REST) for all transactional email. Both via REST from the Worker; Workers cannot do SMTP.
- Tailwind v4 for styling. lucide-react for icons.

There is no Next.js here. If a doc or habit assumes Next, translate it to React Router before using it.

## Hard rules

1. All Cloudflare, native bindings. Reach D1, R2, KV, and Browser Rendering through context.cloudflare.env inside loaders and actions. Never call a Cloudflare service over HTTP and never reach for a Node-only API. If something needs nodejs_compat, flag it before adding it.

2. The data-access layer is the security boundary. D1 has no row-level security, so authorization lives in application code. Every read and write goes through createDataAccess(db) in app/lib/data-access.ts. Nothing imports the Drizzle client or app/db/schema.ts anywhere else. Enforce this with an eslint no-restricted-imports rule and forbid bypass in review. Roles are admin, chair, reviewer (explicit grants); author and attendee are derived from ownership and a paid registration. Conflict of interest is enforced at assignment time.

3. Server and client are separated by file. A route module co-locates a server loader/action with a client component. Any server-only code (database, secrets, the Better Auth instance, R2, Stripe, Resend) lives in a *.server.ts module. A server import leaking into the client bundle is a build break and a security problem; treat it as a blocker. The Stripe and Resend keys must never reach the client.

4. Editions are first-class. Every domain row carries edition_id, and every listing, deadline, fee, and the book generation is a per-edition query. Keep historical editions queryable for the archive.

5. Drizzle for all data access. Define schema in app/db/schema.ts. Generate migrations with drizzle-kit, apply with wrangler. Additive migrations only once data exists. Do not hand-write SQL in route code; use the query builder, behind the data-access layer.

6. Stripe webhook integrity. Verify the signature against STRIPE_WEBHOOK_SECRET on every webhook before acting. The webhook marks a registration paid out of band; it has no acting user, so it does not pass through the actor-scoped data-access functions and must be its own audited path.

7. PDF book is a batch job. Render the book as HTML, convert with Browser Rendering and Paged.js for the TOC, page numbers, running headers, and author index. Run it from a cron or an admin action, never a user request, and store the result in R2.

8. Accessibility target is WCAG 2.2 AA on all public and author-facing surfaces.

## House rules (non-negotiable)

- No em dashes anywhere, in copy or code comments.
- No AI-writing tells in copy or comments.
- Scoped commits: explicit git add of named paths, never git add -A.
- Specs and decisions are recorded in the txasm project vault.

## Commands

- npm run dev - Vite dev server in workerd, bindings available locally.
- npm run build - production build (client + server).
- npm run deploy - wrangler deploy (do not touch txasm.org DNS until cutover).
- npm run typecheck - wrangler types + react-router typegen + tsc -b.
- npm run db:generate - generate a Drizzle migration from schema changes.
- npm run db:migrate - apply migrations to local D1.
- npm run db:migrate:prod - apply migrations to remote D1.

## File layout

```
app/
  root.tsx                 root layout: html, theme
  routes.ts                route config
  routes/
    _index.tsx             public org home
    meetings.*             meeting pages, programs, archive
    officers.tsx           current officers
    register.$edition.tsx  registration + Stripe Checkout
    submit.$edition.*      abstract submission, edit until deadline
    review.*               reviewer dashboards, rubric scoring
    admin.*                chair/admin: assignments, decisions, program, book
    api.auth.$.ts          Better Auth catch-all
    api.stripe-webhook.ts  Stripe webhook (signature-verified, own path)
  db/
    schema.ts              Drizzle schema (editions, users/roles, registrations, abstracts/authors, reviews)
    index.server.ts        drizzle(env.DB) factory
  lib/
    data-access.ts         the only place that imports schema and the Drizzle client
    auth.server.ts         Better Auth instance (magic-link, KV sessions)
    email.server.ts        Resend REST helpers
    stripe.server.ts       Stripe REST + webhook verification
    r2.server.ts           R2 upload/read helpers
    book.server.ts         abstract book HTML + Browser Rendering
workers/
  app.ts                   worker entry; injects context.cloudflare.env; cron handler
drizzle/                   generated migrations
wrangler.jsonc             bindings
```

## Reference, do not copy blindly

Study the germomics, recova, and foxing repos for house style (token wiring, theme switching, lib helper shape, Drizzle usage), then apply current best practice for React Router v8 on Cloudflare. When a community template disagrees with an old habit, prefer the template.

## Definition of done for a feature

Type-checks clean, server/client boundary respected, every data path routes through the data-access layer, accessible, works against local D1 and a preview deploy, no regression to the worker bundle, scoped commit, decision recorded in the vault.
