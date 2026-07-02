CREATE TABLE `institution` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`region` text,
	`country` text DEFAULT 'USA',
	`normalized_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_institution_normalized` ON `institution` (`normalized_name`);