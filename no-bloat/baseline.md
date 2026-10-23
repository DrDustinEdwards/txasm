# No-bloat baseline (phase 0)

Measured 2026-10-09 at commit `c3facc09914c987e9f6007ae6f74f6280e6ec77f` (main), Node 22.22.0 locally (CI uses `.nvmrc`, 24.14.1), Knip 6.41.0, jscpd 4.3.0. Nothing was removed. The machine-readable numbers the CI check compares against are in `baseline.json`.

Capsid job job_5ca7d118fba5 asks for this report at `txasm/baseline.md` in Capsid. It lives here in the repo until the seat copies it there.

## Commands

```sh
npm ci
npx --yes knip@6 --no-progress          # reads knip.json
npx --yes jscpd@4                       # reads .jscpd.json
npm run build && npx devkit-route-weight
```

## Knip (unused files, exports, dependencies)

`knip.json` adds only what the plugins cannot infer. The React Router plugin (enabled by `@react-router/dev`) already takes `app/routes.ts`, `app/root.tsx`, `app/entry.server.tsx` and every route file `routes.ts` names as entries; the Wrangler plugin takes `main` from `wrangler.jsonc`. Checked against the plugin source in knip 6.41.0, because knip.dev is outside this environment's network policy. The config adds the `tsx` scripts and the `node --test` files as entries, includes `app/app.css` in the project so the Tailwind `@import` counts as a use of `tailwindcss`, ignores the `cloudflare:` built-in module specifier, and ignores the `./+types/*` imports React Router generates at typegen. Without that config Knip reported 55 unresolved `+types` imports, `cloudflare` as unlisted, `tailwindcss` as unused and the vendored `public/pdfjs/` files as unused: all false positives.

| Finding | Count |
| --- | --- |
| Unused files | 1 (`app/lib/editions.ts`, a re-export shim of `app/lib/vocab.ts` that nothing imports) |
| Unused dependencies / devDependencies | 0 / 0 |
| Unlisted dependencies | 0 |
| Unresolved imports | 0 |
| Unused exports | 30 (15 in `app/lib/vocab.ts`, 8 in `app/lib/data-access.ts`) |
| Unused exported types | 56 (48 in `app/lib/data-access.ts`) |
| Duplicate exports | 3 (`brand-footer`, `brand-mark`, `brand-wordmark` export the same component as named and default) |

Nothing clearly broken: no missing dependency and no unresolved import.

## jscpd (duplication)

`.jscpd.json`: `app`, `workers`, `scripts`, `tests`; TypeScript, TSX and CSS; min 8 lines and 70 tokens; generated files, seed data and `.d.ts` excluded.

| Format | Files | Lines | Clones | Duplicated lines |
| --- | --- | --- | --- | --- |
| typescript | 36 | 4,673 | 4 | 51 (1.09%) |
| tsx | 59 | 11,076 | 29 | 370 (3.34%) |
| css | 1 | 114 | 0 | 0 |
| Total | 149 | 21,417 | 33 | 421 (1.97%) |

jscpd also prints a "javascript" row of 53 files and 0 clones: that is its own split of the TSX files, not separate files. Largest clones: `meetings.$slug.abstracts.tsx` and `meetings.tsx` (29 lines), the two admin category routes (29), the two admin awards routes (25), the speakers and sponsors routes (22, 18 and 18), `app/lib/book.ts` and `app/lib/program-book.ts` (20).

## Weight per route (gzip, first visit, JS and CSS)

From the client build's route manifest (then `scripts/measure-route-weight.mjs`, now devkit's `devkit-route-weight`). The whole client build is 71 JS files at 182,048 B gzip and 1 CSS file at 7,761 B. Every route ships the one stylesheet.

| Route | Total B | JS B |
| --- | --- | --- |
| heaviest: `abstracts.$abstractId.edit` | 125,007 | 117,246 |
| `admin.editions.$editionId.program` | 123,124 | 115,363 |
| `branch-officers` | 122,160 | 114,399 |
| `home` | 117,862 | 110,101 |
| lightest: `admin.layout` | 116,250 | 108,489 |

Every route sits between 116 and 125 KB; about 108 KB of that is the shared entry, root and framework. Fonts, images and the self-hosted PDF.js under `public/pdfjs/` are not counted. The repo has no real-speed (field or lab timing) check, so there is none to record.

## Lines and dependencies

Lines in tracked files, excluding the vendored `public/pdfjs/`: TSX 13,405; TypeScript 10,669; Python 944 (the abstract-book parser); SQL 610; Markdown 331; shell 225; CSS 114; JavaScript 71; JSON 78,723 (`drizzle/meta/` 50,370, `package-lock.json` 8,747, most of the rest `scripts/seed-data/`).

Dependencies: 9 direct runtime, 15 direct dev; 540 packages in `package-lock.json`, 136 of them runtime. `node_modules` is 848 MB after `npm ci`.

## The CI check

`.github/workflows/no-bloat.yml` runs on every pull request, warn-only: the job and every step are `continue-on-error`, and Knip runs with `--no-exit-code`. Each tool writes to the run's summary; duplication above the baseline percentage, or a route grown past its baseline in `.route-weight.json` by more than 5% and 1 KB, adds a `::warning::`. Locally the three tools take about 4 s (Knip), 2 s (jscpd) and 6 s (build plus weight); with checkout, setup-node with the npm cache and `npm ci`, expect about 1.5 to 2 minutes of Actions time per pull request push.
