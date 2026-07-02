CREATE TABLE `program_item` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`abstract_id` text,
	`custom_title` text,
	`note` text,
	`starts_at` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `program_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`abstract_id`) REFERENCES `abstract`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ix_program_item_session` ON `program_item` (`session_id`);--> statement-breakpoint
CREATE TABLE `program_session` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`title` text NOT NULL,
	`session_date` integer,
	`starts_at` integer,
	`ends_at` integer,
	`location` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_program_session_edition` ON `program_session` (`edition_id`);