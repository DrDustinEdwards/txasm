CREATE TABLE `abstract_book` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`numbering_scheme` text DEFAULT 'prefix' NOT NULL,
	`published_html` text,
	`published_at` integer,
	`generated_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generated_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `abstract_book_edition_id_unique` ON `abstract_book` (`edition_id`);--> statement-breakpoint
CREATE TABLE `book_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`section_id` text NOT NULL,
	`abstract_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`code` text,
	`included` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `abstract_book`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `book_section`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`abstract_id`) REFERENCES `abstract`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_book_entry_book` ON `book_entry` (`book_id`);--> statement-breakpoint
CREATE INDEX `ix_book_entry_section` ON `book_entry` (`section_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_book_entry` ON `book_entry` (`book_id`,`abstract_id`);--> statement-breakpoint
CREATE TABLE `book_section` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`title` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `abstract_book`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_book_section_book` ON `book_section` (`book_id`);