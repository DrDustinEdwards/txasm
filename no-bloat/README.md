# Routine no-bloat checks (warn only)

Three checks run on every pull request in `.github/workflows/no-bloat.yml`. **They report and never block a merge**: defaults, not laws. Removal happens in the cleanup phases, not here.

| Check | Tool | Command | Reads |
| --- | --- | --- | --- |
| Unused files, exports, dependencies | Knip | `npx --yes knip@6` | `knip.json` |
| Duplicated blocks | jscpd | `npx --yes jscpd@4` | `.jscpd.json` |
| JS and CSS weight per route, gzip | devkit's `devkit-route-weight` | `npm run build && npx devkit-route-weight` | `build/client`, `.route-weight.json` |

`baseline.json` holds the Knip and jscpd numbers measured at the commit it names, and `.route-weight.json` each route's weight (`npx devkit-route-weight --write-baseline`); `baseline.md` is the full report with what each number means. Refresh both in the same pull request as a cleanup, so the next report shows the change.
