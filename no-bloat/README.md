# Routine no-bloat checks (warn only)

Three checks run on every pull request in `.github/workflows/no-bloat.yml`. **They report and never block a merge**: defaults, not laws. Removal happens in the cleanup phases, not here.

| Check | Tool | Command | Reads |
| --- | --- | --- | --- |
| Unused files, exports, dependencies | Knip, through devkit's `devkit-no-bloat` | `npx devkit-no-bloat --warn-only` | `knip.json`, `.no-bloat.json` |
| Duplicated blocks | jscpd, through devkit's `devkit-no-bloat` | (the same run) | `.jscpd.json`, `.no-bloat.json` |
| JS and CSS weight per route, gzip | devkit's `devkit-route-weight` | `npm run build && npx devkit-route-weight` | `build/client`, `.route-weight.json` |

`.no-bloat.json` (at the root) holds the Knip and jscpd baseline measured at the commit it names (`npx devkit-no-bloat --write-baseline`), and `.route-weight.json` each route's weight (`npx devkit-route-weight --write-baseline`); `baseline.md` is the full report with what each number means. Refresh both in the same pull request as a cleanup, so the next report shows the change.
