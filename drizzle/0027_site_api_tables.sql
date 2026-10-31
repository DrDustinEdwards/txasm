CREATE TABLE IF NOT EXISTS scheduled_updates (
  content_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  publish_at TEXT NOT NULL,
  change_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scheduled_updates_due ON scheduled_updates (publish_at);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS site_api_writes (
  change_id TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status INTEGER,
  response TEXT,
  state TEXT NOT NULL,
  at TEXT NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS site_api_writes_at ON site_api_writes (at);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hook_retries (
  id TEXT PRIMARY KEY,
  hook TEXT NOT NULL,
  event TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  next_at TEXT NOT NULL,
  last_error TEXT NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hook_retries_due ON hook_retries (next_at);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS preview_links (
  token_hash TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  change_id TEXT NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS preview_links_content ON preview_links (content_id, expires_at);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS webmention_targets (
  source TEXT PRIMARY KEY,
  targets TEXT NOT NULL,
  sent_at TEXT NOT NULL
);
