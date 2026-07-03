# Meeting import datasets

Each file here is a standard dataset bundle for one past meeting, consumed by
`scripts/import-meeting.ts`. The importer inserts the meeting through the
data-access layer, so seeded abstracts run the same sanitizers and validation as
live submissions. Everything meeting-specific lives in the data file, never in
the importer.

## Format

```json
{
  "meeting": {
    "slug": "spring-2026",
    "name": "Spring 2026 Meeting",
    "season": "spring",
    "year": 2026,
    "status": "archived",
    "meetingStartsAt": "2026-03-26",
    "meetingEndsAt": "2026-03-28",
    "venueName": "Mt. Lebanon Camps",
    "city": "Cedar Hill, TX"
  },
  "topics": ["Antimicrobial Microbiology", "..."],
  "abstracts": [
    {
      "code": "UO1",
      "level": "undergraduate",
      "format": "oral",
      "topic": "Antimicrobial Microbiology",
      "title_html": "Title with <em>italics</em> only",
      "authors": [{ "name": "Ada Ramirez", "affil_refs": ["1", "2"] }],
      "affiliations": [{ "num": "1", "text": "Department, Institution, City, ST" }],
      "body_html": "Body with <em>em</em>, <sup>sup</sup>, <sub>sub</sub> only",
      "title_reconstructed": false
    }
  ]
}
```

Notes:

- `level` must be one of the level vocabulary values (undergraduate, graduate,
  education, high_school, postdoctoral); `format` is oral or poster.
- `title_html` and `body_html` carry only em/sup/sub markup. The importer
  sanitizes both, so anything outside the allowlist is stripped.
- `affil_refs` are the affiliation numbers an author belongs to. When empty and
  the abstract has exactly one affiliation, the author attaches to that lone
  affiliation.
- `topic` must match one of the `topics` strings; the importer maps it to the
  created category.

## Running (local)

```
# local D1
npm run import:meeting -- scripts/seed-data/spring-2026.json

# replace an already-imported meeting
npm run import:meeting -- scripts/seed-data/spring-2026.json --clear
```

The importer writes local D1 only.

## Seeding production

Run the importer against local, verify, then copy the sanitized rows up with
wrangler's remote channel (bound parameters go through the local importer;
wrangler's own remote execute reliably reaches production):

```
npx wrangler d1 export txasm --local --no-schema \
  --table edition --table abstract_category --table abstract \
  --table author --table affiliation --table author_affiliation \
  --output meeting.sql
```

Prepend one `INSERT OR IGNORE` for the `system-import` user (id `system-import`,
email `import@system.txasm.invalid`), which owns imported abstracts, then:

```
npx wrangler d1 execute txasm --remote --file meeting.sql
npx wrangler d1 execute txasm --remote --command "SELECT COUNT(*) FROM abstract;"
```

## Clearing a seeded meeting

Deleting the edition row cascades to its categories, abstracts, authors,
affiliations, and program rows (use `--remote` for production):

```
npx wrangler d1 execute txasm --local --command "DELETE FROM edition WHERE slug='spring-2026';"
```
