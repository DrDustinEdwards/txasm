-- One-off, idempotent seed for the single platform_settings row. The id is fixed
-- to 'default' and ON CONFLICT DO NOTHING keeps re-runs safe; it never overwrites
-- values an admin later edits. The id and timestamp columns have app-level
-- (Drizzle) defaults rather than SQL defaults, so they are supplied here.
-- Apply with: wrangler d1 execute txasm --file scripts/seed-platform-settings.sql
--   (add --local for the local DB, --remote for production).

INSERT INTO platform_settings (
  id,
  org_name,
  short_name,
  org_full_name,
  tagline,
  founding_year,
  contact_email,
  facebook_url,
  footer_links,
  default_currency,
  default_abstract_word_limit,
  created_at,
  updated_at
)
VALUES (
  'default',
  'Texas Branch ASM',
  'TXASM',
  'Texas Branch of the American Society for Microbiology',
  'Advancing microbiology across Texas.',
  1941,
  NULL,
  'https://www.facebook.com/groups/texasbranchasm',
  '[{"label":"Officers","url":"/officers"},{"label":"Awards","url":"/awardees"},{"label":"Contact","url":"/contact"}]',
  'usd',
  250,
  (CAST(strftime('%s','now') AS INTEGER) * 1000),
  (CAST(strftime('%s','now') AS INTEGER) * 1000)
)
ON CONFLICT (id) DO NOTHING;
