CREATE TABLE `page_404_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`day` integer NOT NULL,
	`path` text NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_404_daily_day_path_uq` ON `page_404_daily` (`day`,`path`);