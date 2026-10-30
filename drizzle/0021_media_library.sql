CREATE TABLE `media` (
	`key` text PRIMARY KEY NOT NULL,
	`filename` text,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`sha256` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`focus` text,
	`credit` text DEFAULT '' NOT NULL,
	`license` text DEFAULT '' NOT NULL,
	`source_url` text,
	`license_expires` text,
	`taken_at` text,
	`trashed_at` integer,
	`rev` integer DEFAULT 0 NOT NULL,
	`uploaded_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_media_sha256` ON `media` (`sha256`);--> statement-breakpoint
CREATE TABLE `media_change` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_revision` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_key` text NOT NULL,
	`at` integer NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`reason` text NOT NULL,
	`sha256` text,
	`backup_key` text,
	FOREIGN KEY (`media_key`) REFERENCES `media`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_media_revision_key` ON `media_revision` (`media_key`,`id`);