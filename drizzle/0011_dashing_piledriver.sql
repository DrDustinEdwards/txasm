CREATE TABLE `award` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`namesake_bio` text,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `award_slug_unique` ON `award` (`slug`);--> statement-breakpoint
CREATE TABLE `award_recipient` (
	`id` text PRIMARY KEY NOT NULL,
	`award_id` text NOT NULL,
	`edition_id` text,
	`year` text NOT NULL,
	`category` text,
	`placement` text,
	`person_name` text NOT NULL,
	`institution` text,
	`mentor` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`award_id`) REFERENCES `award`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ix_award_recipient_award` ON `award_recipient` (`award_id`);--> statement-breakpoint
CREATE INDEX `ix_award_recipient_edition` ON `award_recipient` (`edition_id`);--> statement-breakpoint
CREATE INDEX `ix_award_recipient_person` ON `award_recipient` (`person_name`);--> statement-breakpoint
CREATE INDEX `ix_award_recipient_institution` ON `award_recipient` (`institution`);--> statement-breakpoint
CREATE INDEX `ix_award_recipient_mentor` ON `award_recipient` (`mentor`);--> statement-breakpoint
CREATE INDEX `ix_award_recipient_year` ON `award_recipient` (`year`);