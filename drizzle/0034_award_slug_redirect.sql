CREATE TABLE `award_slug_redirect` (
	`from_slug` text PRIMARY KEY NOT NULL,
	`award_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`award_id`) REFERENCES `award`(`id`) ON UPDATE no action ON DELETE cascade
);
