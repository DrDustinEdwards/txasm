ALTER TABLE page_404_daily ADD COLUMN referrer_host TEXT NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE page_404_daily ADD COLUMN kind TEXT NOT NULL DEFAULT 'page';--> statement-breakpoint
DROP INDEX IF EXISTS page_404_daily_day_path_uq;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS page_404_daily_day_path_referrer_uq ON page_404_daily (day, path, referrer_host);
