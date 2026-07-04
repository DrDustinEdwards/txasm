ALTER TABLE `document` ADD `mime_type` text DEFAULT 'application/pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE `document` ADD `file_kind` text DEFAULT 'pdf' NOT NULL;