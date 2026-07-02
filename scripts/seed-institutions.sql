-- One-off, idempotent seed for the institution master list (the Texas regulars).
-- Dedup is by normalized_name via the unique index, so re-running is safe. The
-- id and timestamp columns have app-level (Drizzle) defaults rather than SQL
-- defaults, so they are supplied here. country defaults to USA at the DB level.
-- Apply with: wrangler d1 execute txasm --file scripts/seed-institutions.sql
--   (add --local for the local DB, --remote for production).

INSERT INTO institution (id, name, city, region, normalized_name, created_at, updated_at)
VALUES
  (lower(hex(randomblob(16))), 'Rice University', 'Houston', 'TX', 'rice university', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'University of Texas at Dallas', 'Dallas', 'TX', 'university of texas at dallas', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'University of Texas at San Antonio', 'San Antonio', 'TX', 'university of texas at san antonio', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'Texas A&M University', 'College Station', 'TX', 'texas a&m university', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'Baylor University', 'Waco', 'TX', 'baylor university', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'University of North Texas', 'Denton', 'TX', 'university of north texas', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'Sam Houston State University', 'Huntsville', 'TX', 'sam houston state university', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'St. Edward''s University', 'Austin', 'TX', 'st. edward''s university', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'Midwestern State University', 'Wichita Falls', 'TX', 'midwestern state university', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'University of Dallas', 'Irving', 'TX', 'university of dallas', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'Abilene Christian University', 'Abilene', 'TX', 'abilene christian university', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'Texas Tech University', 'Lubbock', 'TX', 'texas tech university', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'University of Texas at Tyler', 'Tyler', 'TX', 'university of texas at tyler', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'UTHealth Houston', 'Houston', 'TX', 'uthealth houston', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'McGovern Medical School', 'Houston', 'TX', 'mcgovern medical school', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'UT Southwestern Medical Center', 'Dallas', 'TX', 'ut southwestern medical center', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'Wharton County Junior College', 'Wharton', 'TX', 'wharton county junior college', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'University of Texas at Austin', 'Austin', 'TX', 'university of texas at austin', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'Texas State University', 'San Marcos', 'TX', 'texas state university', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'University of Houston', 'Houston', 'TX', 'university of houston', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'Tarleton State University', 'Stephenville', 'TX', 'tarleton state university', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000)),
  (lower(hex(randomblob(16))), 'Texas Tech University Health Sciences Center', 'Lubbock', 'TX', 'texas tech university health sciences center', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000))
ON CONFLICT(normalized_name) DO NOTHING;
