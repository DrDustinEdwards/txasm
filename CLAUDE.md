# CLAUDE.md - txasm

Current state is `txasm/core.md` in Capsid. This file holds only what is true of this repo. Before writing anything another site might have, read what the family shares: https://github.com/DrDustinEdwards/devkit/blob/shared-list/SHARED.md (CI's family check fails on a copy).

## What this is

txasm.org: a conference and abstract-management platform for the Texas Branch of the American Society for Microbiology, replacing the paid Oxford Abstracts service and the old WordPress site. It runs the full lifecycle of a meeting twice a year: registration and payment, abstract submission and editing, reviewer invitation and rubric scoring, accept/reject decisions, the program schedule, and an auto-generated abstract book PDF. Solo-maintained. Each meeting is an edition; the same code runs every meeting forever.

Decisions go to `txasm/decisions.md`.

- Tests: keep the minimal set (a few browser tests for flows that must never break, one integration test per real behavior, unit tests only for tricky logic, shared code tested once where it lives), and remove any test that pins design, repeats coverage or has never caught a real mistake, unless it guards a harm that cannot be undone.

## Stack (repo-specific additions to the house stack)

- React Router v8 + React 19 + TypeScript, Vite with @cloudflare/vite-plugin. Dev server runs in workerd, so local dev mirrors production.
- D1 via Drizzle, R2 for uploads (figures, camera-ready files, generated books), Cron Triggers for deadline jobs and reminders, Browser Rendering for the book PDF.
- Better Auth on D1/Drizzle with the family sign-in from site-runtime `./sign-in`: a passkey first, an email link before one exists (Turnstile on it once its keys are set), no passwords, no Google or Apple. Sessions and the sign-in rate limit are in D1. Platform admins are seeded on first sign-in from ADMIN_EMAILS (comma-separated allowlist); ADMIN_EMAIL is the older single-value form, honored when ADMIN_EMAILS is unset.
- PayPal for registration payments: not built yet (only the schema columns exist); checkout and a signature-verified webhook come with it. Cloudflare Email Service via the native send_email binding; email goes live at cutover once txasm.org is on Cloudflare DNS.
- Capsomer (the family design system, `capsomer` pinned to a release tag) with the navy family and the txasm site layer; plain CSS in `app/app.css`, no Tailwind.
- Carrel edits the site pages (`page` in D1: home, award-nominations) through `@dustinedwards/site-api` at /api/carrel/v1 (`app/lib/carrel`, its key the CARREL_SITE_KEY secret), rendering markdown with Prelum.

Reach D1, R2, KV, the send_email binding, and Browser Rendering through the injected Cloudflare context (`context.get(cloudflareContext).env`, from `app/load-context.ts`).

## Commands

- `npm run dev` - Vite dev server in workerd, bindings available locally
- `npm run build` - production build (client + server)
- `npm run deploy` - wrangler deploy (do not touch txasm.org DNS until cutover). A merge to main deploys: CI's `deploy` job applies D1 migrations, then deploys, while the repo variable `CF_DEPLOY` is `true`.
- `npm run typecheck` - wrangler types + react-router typegen + tsc -b
- `npm run lint` and `npm test` - eslint, and the node tests in `tests/` (real D1 and R2 in Miniflare)
- `npm run db:generate` / `db:migrate` / `db:migrate:prod`

## Hard rules

1. The data-access layer is the security boundary. D1 has no row-level security, so authorization lives in application code. Every read and write goes through `getDataAccess(env)` in `app/lib/data-access.ts`. Nothing imports the Drizzle client or `app/db/schema.ts` anywhere else. Enforced by an eslint no-restricted-imports rule; forbid bypass in review. Roles are admin, chair, reviewer (explicit grants); author and attendee are derived from ownership and a paid registration. Conflict of interest is enforced at assignment time.
2. Editions are first-class. Every domain row carries `edition_id`. Every listing, deadline, fee, and the book generation is a per-edition query. Keep historical editions queryable for the archive.
3. Migrations are generated with drizzle-kit, applied with wrangler, and additive only once data exists.
4. Payment webhook integrity. Verify the PayPal webhook signature before acting. The webhook marks a registration paid out of band; it has no acting user, so it does not pass through the actor-scoped data-access functions and must be its own audited path. PayPal keys must never reach the client.
