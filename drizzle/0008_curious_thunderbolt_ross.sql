CREATE TABLE `invited_speaker` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`name` text NOT NULL,
	`affiliation` text,
	`role` text,
	`talk_title` text,
	`bio` text,
	`headshot_r2_key` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_invited_speaker_edition` ON `invited_speaker` (`edition_id`);--> statement-breakpoint
CREATE TABLE `sponsor` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`name` text NOT NULL,
	`tier` text,
	`url` text,
	`logo_r2_key` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_sponsor_edition` ON `sponsor` (`edition_id`);--> statement-breakpoint
ALTER TABLE `program_item` ADD `speaker_id` text REFERENCES invited_speaker(id);--> statement-breakpoint
ALTER TABLE `program_item` ADD `kind` text DEFAULT 'talk' NOT NULL;