CREATE TABLE IF NOT EXISTS scheduled_updates (
  content_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  publish_at TEXT NOT NULL,
  change_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scheduled_updates_due ON scheduled_updates (publish_at);
