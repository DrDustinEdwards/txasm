# CLAUDE.md - txasm

txasm.org: the meeting platform for the Texas Branch of the American Society for Microbiology (registration, abstracts, review, program, abstract book PDF), replacing Oxford Abstracts and the old WordPress site. Each meeting is an edition; the same code runs every meeting.

## Rules every repo shares

- **Tests.** Reproduce a reported failure before fixing it, and report red before and green after. Keep the minimal set: a few browser tests for flows that must never break, one integration test per real behavior, unit tests only for tricky logic, shared code tested once where it lives. Remove a test that pins design, repeats coverage or never caught a mistake, unless it guards a harm that cannot be undone.
- **UI copy.** Let the layout explain: no eyebrows, restating subtitles, "this page lets you" intros, hints a label already gives or empty-state essays. Labels, accessible names, errors, one-way warnings and legal text stay (Dustin, 2026-11-18; capsid/conventions.md).
- **Shared code.** Before writing anything another site might have, check https://github.com/DrDustinEdwards/devkit/blob/shared-list/SHARED.md. Change shared code in place and delete what the change replaces in the same PR.
- **Browser support.** devkit's docs/browser-support.md: Baseline Widely available freely, Newly available with a small fallback, Limited only feature-detected, no polyfills.
- **Secrets.** Never commit or print a key, token, `.dev.vars` or `.env`.
- **Deploys.** A merge to the default branch deploys; never deploy from a session.
- **D1.** Never hand-run production DDL; CI applies additive migrations and refuses the rest. Back up and restore with d1-dump, never `wrangler d1 export` (it fails on FTS5 tables).
- **Site copy and AI.** Copy describes only what the current build does. An AI provider key stays on the server, never in a client.

## Stack notes

- React Router 8 on Workers (Vite in workerd); D1 via Drizzle, R2, Cron Triggers, Browser Rendering for the book PDF. Reach bindings through `context.get(cloudflareContext).env` (`app/load-context.ts`).
- Sign-in is site-runtime `./sign-in` on Better Auth: passkey first, email link before one exists, no passwords or social logins. Admins are ADMIN_EMAIL and CO_OWNER_EMAILS, checked on every request.
- PayPal is not built yet (schema columns only). Email goes live at cutover; do not touch txasm.org DNS until then.
- Look: Capsomer plus the txasm layer in `app/app.css`. Carrel edits the `page` rows through site-api (`app/lib/carrel`); pages show only media-library pictures; book and program covers are inline SVG (`app/lib/cover.ts`).

## Commands

- `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` (node tests in `tests/`, real D1 and R2 in Miniflare).
- `npm run db:generate` / `db:migrate` / `db:migrate:prod`: drizzle-kit generates, wrangler applies.

## Hard rules

A rule stays here only if it stops a real, costly mistake that nothing else catches.

1. D1 has no row-level security, so every authorization check lives in `getDataAccess(env)` (`app/lib/data-access.ts`). Roles: admin, chair, reviewer by grant; author and attendee by ownership and a paid registration. Conflict of interest is checked at assignment. Chairs stay out of admin-only config, and the confidential comment is for chairs and admins only.
2. Editions are first-class: every domain row carries `edition_id`, every listing, deadline, fee and book is a per-edition query, and past editions stay queryable. The rubric is data (rubric_criterion, review_score), not columns.
3. The PayPal webhook verifies its signature before acting and is its own audited path (it has no acting user). PayPal keys never reach the client.
4. Abstracts are structured text with only `<em>`, `<sup>` and `<sub>`, re-sanitized on every save. Image responses keep the sandboxed CSP and nosniff. The category value `brand_image` never changes, and brand images stay out of the public archive.
5. Visible copy says "Meeting"; code, tables and URLs say "edition".
