---
name: verify
description: Use before committing or opening a pull request that changes what txasm shows or does (app/routes, app/components, app/styles, app/lib, workers/, drizzle/). Boots the app in Vite on workerd with a local D1, drives the changed public flow in Chromium with Playwright, runs the node tests that cover the area, and reports the evidence. Signed-in flows are proved by tests/ and the live check, not here.
---

# Verify a txasm change

Tests prove what someone thought to test. This skill proves the change itself: run
the real app, use the changed flow as a visitor would, and look at the result. Do it
before every commit that touches `app/`, `workers/` or `drizzle/`, and before the
pull request. Never touch txasm.org DNS or the WordPress site; deploys are CI's.

## 1. Boot the app on a local D1

From the repo root, on the repo's Node (`.nvmrc`; in a cloud session prepend a Node
26 to PATH, for example `~/.cache/capsid-node/node-v26.13.1-linux-x64/bin`):

```sh
npm ci
[ -f .dev.vars ] || cp .dev.vars.example .dev.vars
sed -i 's/^BETTER_AUTH_SECRET=$/BETTER_AUTH_SECRET=local-dev-secret-not-real-0123456789/' .dev.vars
npm run db:migrate
npx wrangler d1 execute txasm --local --file scripts/seed-platform-settings.sql
npm run import:meeting -- scripts/seed-data/spring-2026.json
```

`.dev.vars` is gitignored (never commit it). `db:migrate` applies `drizzle/` to the
local D1 under `.wrangler/state`; the two seed steps add the platform settings
row (the home page header and footer) and one archived meeting, `spring-2026`, with
108 abstracts. Re-run the import with `--clear` after the slug exists.

Check the port is free, then start Vite (workerd, local D1 and R2, bindings from
`wrangler.jsonc`) in the background:

```sh
curl -s -o /dev/null -m 2 http://localhost:5173/ && echo "5173 is busy: pick another port below" || echo "5173 free"
npm run dev -- --port 5173 --strictPort    # run in the background
```

If 5173 is busy, use another port in both commands; it may be another repo's
server. Wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/`
prints 200 (the first request compiles and takes a few seconds), then confirm it is
this app: `curl -s http://localhost:5173/ | grep -o '<title>[^<]*'` prints a
TXASM title, and `/health` answers `"db":"up"` (a `warn` about backups is normal
locally).

What local shows: public pages (home, meetings, abstracts, program, archive,
awards, officers), the headers and CSP the Worker sends, and the schema from every
migration. What it cannot show: email (dormant, `EMAIL_ENABLED=false`, messages are
logged), PayPal (not built), Turnstile, Cloudflare Access (`ACCESS_DEV_BYPASS="1"`
only lets localhost past the Access cookie check; it does not sign anyone in),
Browser Rendering for the abstract book PDF, Images resizing, and the edge cache.

## 2. Drive the changed flow

The repo has no browser driver, so use the container's preinstalled Playwright. In a
cloud session `require('playwright')` works from any directory in a `.cjs` script
and `chromium.launch()` needs no options. Write the script in the session's
scratchpad, never in the repo. Name each step the way a person would say it, act
through roles and labels, and assert what the person should see afterward. Collect
console errors and page errors, and keep a screenshot of the end state.

```js
// <scratchpad>/drive.cjs: cd <scratchpad> && node drive.cjs http://localhost:5173/
const { chromium } = require("playwright");
(async () => {
  const base = process.argv[2];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  const log = [];
  async function step(name, fn) {
    try {
      await fn();
      log.push(`ok   ${name}`);
    } catch (e) {
      log.push(`FAIL ${name}: ${e.message.split("\n")[0]}`);
      await page.screenshot({ path: "fail.png", fullPage: true });
      throw e;
    }
  }
  try {
    await step("open the home page", async () => {
      const r = await page.goto(base);
      if (!r.ok()) throw new Error(`status ${r.status()}`);
      await page.getByRole("link", { name: "Officers" }).first().waitFor();
    });
    await step("go to Meetings", async () => {
      await page.getByRole("button", { name: "Meetings" }).first().click();
      await page.getByRole("link", { name: "Meetings and abstracts" }).first().click();
      await page.getByRole("heading", { name: "Meetings", level: 1 }).waitFor();
    });
    await step("open the 2026 Spring abstracts", async () => {
      await page.locator('a[href="/meetings/spring-2026/abstracts"]').first().click();
      await page.getByRole("heading", { name: "2026 Spring Meeting", level: 1 }).waitFor();
    });
    // ...the changed flow: click, fill, submit, then assert the visible result.
    await page.screenshot({ path: "after.png", fullPage: true });
  } finally {
    console.log(log.join("\n"));
    console.log("console errors:", errors.length ? errors : "none");
    await browser.close();
  }
})();
```

Drive the whole flow, not just the page load: follow the link, submit the form, see
the result, go back, reload and see it hold. If the change is responsive or themed,
repeat the end state at 390 px wide and in dark mode (`page.setViewportSize`,
`page.emulateMedia({ colorScheme: "dark" })`).

`npm run dev` adds a devkit dev toolbar and view transitions, and they log known
console errors that production does not: a 404 for `/@devkit/axe.js`, `Cannot set
properties of null (setting 'hidden')` and `Cannot read properties of null (reading
'replaceChildren')` from `toolbar.js`, and `ViewTransition
opt-in disabled`. Anything else in the list is a finding.

Signed-in flows (submit, my abstracts, review, admin) have no local sign-in: the
sign-in is a passkey or an emailed link, and email is dormant. The repo has no seed
or test helper that signs a browser in, so do not invent one. Those flows are proved
by the node tests in step 3 and by the live check below.

Stop the dev server you started when done (its own background task, or kill its
PID; other sessions may run servers in the same machine, so never `pkill` by name), and remove
`.dev.vars` if you made it (`git status` should show nothing new).

## 3. Run the tests that cover the area

`npm test` runs `tests/*.test.ts` on real D1 and R2 in Miniflare and takes under a
minute. Run the whole thing, or one file:

```sh
npx tsx --test tests/authorization.test.ts
```

| Area changed                                                     | File                          |
| ---------------------------------------------------------------- | ----------------------------- |
| data-access, roles, chair and reviewer limits, accounts, program | `tests/authorization.test.ts` |
| Access check on `/admin`                                         | `tests/access.test.ts`        |
| Session reads                                                    | `tests/session.test.ts`       |
| Review scores                                                    | `tests/reviews.test.ts`       |
| Award slugs and redirects                                        | `tests/award-renames.test.ts` |
| Nightly backup                                                   | `tests/backup.test.ts`        |
| Carrel's site API                                                | `tests/carrel.test.ts`        |
| Abstract book, Paged.js                                          | `tests/paged.test.ts`         |
| Drizzle imports outside data-access                              | `tests/boundary.test.ts`      |

CI's `ci` job also runs `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run check:console`, `npm run check:migrations` and `npm run check:session`, then
`npm run build`. Run the ones your change can trip before the pull request.
A new migration in `drizzle/` only adds (generate it with `npm run db:generate`).

## Rules

- A failed step is a finding about the change. Fix the code, then run the same
  script again. Never add a sleep, a retry or a looser selector to make it pass.
- If a step fails sometimes, find out why before going on; a flaky check teaches
  the next thread to re-run instead of fix.
- Never edit an existing test to make it agree with new behavior unless the change
  is meant to alter that behavior, and say so in the pull request.
- Leave nothing behind: stop the server, and keep the scripts and screenshots in
  the scratchpad. Nothing from this skill is committed.

## The report

Put this in the reply and the pull request body:

- First line: verified, partly verified (and what was not), or failed.
- Each step's ok or FAIL line, verbatim, and the console errors line.
- The end-state screenshot, attached (Dustin cannot open a scratchpad path).
- The test run's summary lines (`tests`, `pass`, `fail`).
- Anything local cannot show (signed-in flows, email, PayPal, Access, the book
  PDF), named as not verified. The live check runs after the merge: CI's `deploy`
  job (`.github/workflows/ci.yml`) waits for `/health` to report the commit,
  fetches the home page and rolls back if it does not answer 200; look at
  https://txasm.dustin-edwards.workers.dev/health and the home page after it.
