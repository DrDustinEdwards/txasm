CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  event TEXT NOT NULL,
  change TEXT,
  via TEXT,
  user_id TEXT,
  device TEXT,
  location TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_events_user ON auth_events (user_id, at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_events_at ON auth_events (at, event);
