# Routine no-bloat checks (warn only)

Three checks run on every pull request in `.github/workflows/no-bloat.yml`. **They report and never block a merge**: defaults, not laws. Removal happens in the cleanup phases, not here.

| Check | Tool | Command | Reads |
| --- | --- | --- | --- |
| Unused files, exports, dependencies | Knip | `npx --yes knip@6` | `knip.json` |
| Duplicated blocks | jscpd | `npx --yes jscpd@4` | `.jscpd.json` |
| JS and CSS weight per route, gzip | `scripts/measure-route-weight.mjs` | `npm run build && node scripts/measure-route-weight.mjs` | `build/client` |

`baseline.json` holds the numbers measured at the commit it names; `baseline.md` is the full report with what each number means. Refresh both in the same pull request as a cleanup, so the next report shows the change.
