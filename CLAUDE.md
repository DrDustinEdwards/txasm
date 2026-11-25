# CLAUDE.md - txasm

txasm.org: the meeting platform for the Texas Branch of the American Society for Microbiology. Each meeting is an edition; the same code runs every meeting.

## Rules every repo shares

- **Tests.** Reproduce a reported failure before fixing it: red before, green after.
- **UI copy.** No eyebrows, restating subtitles, intros or hints a label already gives (Dustin, 2026-11-18).
- **Shared code.** Check devkit's [SHARED.md](https://github.com/DrDustinEdwards/devkit/blob/shared-list/SHARED.md) before writing anything another repo might have; change it in place.
- **Secrets.** Never commit or print a key or token. AI provider keys stay on the server.
- **Production.** Never deploy, tag, release or run production DDL from a session; a merge deploys. Back up and restore D1 only with d1-dump.

## Rules for this repo

- **Data access.** D1 has no row-level security, so every authorization check lives in `getDataAccess(env)` (`app/lib/data-access.ts`). Conflict of interest is checked at assignment; the confidential comment is for chairs and admins only.
- **PayPal.** The webhook verifies its signature before acting. PayPal keys never reach the client.
- **Uploads.** Abstracts allow only `<em>`, `<sup>` and `<sub>`, re-sanitized on every save. Image responses keep the sandboxed CSP and nosniff. The category value `brand_image` never changes, and brand images stay out of the public archive.
- **Cutover.** Never touch the old WordPress site or txasm.org DNS until cutover.

## Commands

- `npm run typecheck`, `npm run lint`, `npm test`.
