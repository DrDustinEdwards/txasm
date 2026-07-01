CREATE TABLE `decision` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`abstract_id` text NOT NULL,
	`outcome` text NOT NULL,
	`presentation_type` text,
	`decision_message` text,
	`decided_by_id` text NOT NULL,
	`decided_at` integer NOT NULL,
	`notify_state` text DEFAULT 'none' NOT NULL,
	`notified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`abstract_id`) REFERENCES `abstract`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_decision_edition` ON `decision` (`edition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_decision_abstract` ON `decision` (`abstract_id`);