CREATE INDEX `ix_review_abstract` ON `review` (`abstract_id`,`status`);--> statement-breakpoint
PRAGMA optimize;
