# D3.2 finding: txasm has non-admin sign-in

Job job_f0d60ee9a9f8, 2026-10-09. Read-only: from the code and schema, no production query.

**Result: non-admin sign-in exists, so Cloudflare Access can cover only the admin paths. The magic link stays. No code was deleted and nothing was changed.**

## Evidence

- `app/lib/auth.server.ts`: Better Auth magic link is open to any email. The first sign-in creates a `user` row. Only addresses in ADMIN_EMAILS (or ADMIN_EMAIL) get an admin `role_grant`; everyone else is an ordinary user.
- `app/routes/signin.tsx` is a public route that sends a link to any address entered.
- Non-admin routes that call `requireUser` and need a session: `my.abstracts`, `submit.$slug`, `abstracts.$abstractId.edit` (authors submit and edit), `review`, `review.$assignmentId` (reviewers), `api.institutions` (author type-ahead).
- `role_grant.role` is `admin`, `chair` or `reviewer`, per edition. The `invitation` table invites chairs and reviewers by email, with an accept token. Authors are derived from abstract ownership and attendees from a paid registration, so both are ordinary signed-in users.
- Admin paths: `admin`, `admin/*`, and the book, program and document download resources under `admin/editions/:editionId/...`. `requireAdmin` and `requireChair` guard them.

## What follows

- Access (Zero Trust application) would cover `/admin*` only. Chairs also use `admin/editions/:editionId/...` routes (`requireChair`), so Access on `/admin*` would lock chairs out unless they are added to the Access policy too. That is a decision.
- Deleting Better Auth is not possible while authors and reviewers sign in with it. The `verification` table and the sign-in route stay.
- EMAIL_ENABLED stays off; nothing here enables email.

## DECIDE

1. Should Access cover `/admin*` for admins and chairs both (chairs then sign in twice, once to Access and once with the magic link), or admins only with `/admin/editions/*` left to the app's own check? Recommendation: do nothing yet. Access adds a second login for the same people and removes no code, so the gain is small. Revisit if the aim is to take the admin surface off the public internet.
2. If you do want Access on `/admin*`, say so and the next job writes the one-at-a-time Zero Trust steps, adds the `jose` verification (as carrel does) with the red tests (no assertion, wrong audience, expired token), and leaves the table-dropping migration as your step.
