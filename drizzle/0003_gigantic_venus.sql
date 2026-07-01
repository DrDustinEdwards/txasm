CREATE TABLE `abstract_book` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`r2_key` text,
	`file_name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`abstract_count` integer,
	`generated_by_id` text,
	`generated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generated_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_abstract_book_edition` ON `abstract_book` (`edition_id`);