CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`season` text,
	`edition_id` text,
	`editor` text,
	`r2_key` text,
	`file_name` text,
	`slug` text NOT NULL,
	`abstract_count` integer,
	`generated_by_id` text,
	`generated_at` integer,
	`gen_status` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`generated_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_slug_unique` ON `document` (`slug`);--> statement-breakpoint
CREATE INDEX `ix_document_category_year_season` ON `document` (`category`,`year`,`season`);--> statement-breakpoint
CREATE INDEX `ix_document_edition` ON `document` (`edition_id`);--> statement-breakpoint
CREATE INDEX `ix_document_status` ON `document` (`status`);