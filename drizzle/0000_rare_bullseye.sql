CREATE TABLE `abstract` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`submitter_id` text NOT NULL,
	`category_id` text,
	`title` text NOT NULL,
	`background` text,
	`methods` text,
	`results` text,
	`conclusions` text,
	`body_text` text,
	`presentation_preference` text DEFAULT 'either' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_at` integer,
	`withdrawn_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submitter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `abstract_category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_abstract_edition` ON `abstract` (`edition_id`);--> statement-breakpoint
CREATE INDEX `ix_abstract_submitter` ON `abstract` (`submitter_id`);--> statement-breakpoint
CREATE TABLE `abstract_category` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_abstract_category` ON `abstract_category` (`edition_id`,`name`);--> statement-breakpoint
CREATE TABLE `abstract_file` (
	`id` text PRIMARY KEY NOT NULL,
	`abstract_id` text NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text,
	`size_bytes` integer,
	`uploaded_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`abstract_id`) REFERENCES `abstract`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `abstract_file_r2_key_unique` ON `abstract_file` (`r2_key`);--> statement-breakpoint
CREATE INDEX `ix_abstract_file_abstract` ON `abstract_file` (`abstract_id`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_account_user` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `affiliation` (
	`id` text PRIMARY KEY NOT NULL,
	`abstract_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`institution` text NOT NULL,
	`department` text,
	`city` text,
	`country` text,
	FOREIGN KEY (`abstract_id`) REFERENCES `abstract`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_affiliation_ordinal` ON `affiliation` (`abstract_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `author` (
	`id` text PRIMARY KEY NOT NULL,
	`abstract_id` text NOT NULL,
	`user_id` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`ordinal` integer NOT NULL,
	`is_presenting` integer DEFAULT false NOT NULL,
	`is_corresponding` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`abstract_id`) REFERENCES `abstract`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_author_abstract` ON `author` (`abstract_id`);--> statement-breakpoint
CREATE INDEX `ix_author_user` ON `author` (`user_id`);--> statement-breakpoint
CREATE TABLE `author_affiliation` (
	`author_id` text NOT NULL,
	`affiliation_id` text NOT NULL,
	PRIMARY KEY(`author_id`, `affiliation_id`),
	FOREIGN KEY (`author_id`) REFERENCES `author`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`affiliation_id`) REFERENCES `affiliation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `edition` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`season` text NOT NULL,
	`year` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`registration_opens_at` integer,
	`registration_closes_at` integer,
	`submission_opens_at` integer,
	`submission_deadline` integer,
	`review_deadline` integer,
	`meeting_starts_at` integer,
	`meeting_ends_at` integer,
	`venue_name` text,
	`venue_address` text,
	`city` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `edition_slug_unique` ON `edition` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_edition_season_year` ON `edition` (`season`,`year`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by_id` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_token_unique` ON `invitation` (`token`);--> statement-breakpoint
CREATE INDEX `ix_invitation_edition` ON `invitation` (`edition_id`);--> statement-breakpoint
CREATE INDEX `ix_invitation_email` ON `invitation` (`email`);--> statement-breakpoint
CREATE TABLE `registration` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `registration_category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_registration_edition` ON `registration` (`edition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_registration_user_edition` ON `registration` (`edition_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `registration_category` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reg_category` ON `registration_category` (`edition_id`,`key`);--> statement-breakpoint
CREATE TABLE `review` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`edition_id` text NOT NULL,
	`abstract_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`recommendation` text,
	`overall_comment` text,
	`confidential_comment` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `review_assignment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`abstract_id`) REFERENCES `abstract`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_review_assignment` ON `review` (`assignment_id`);--> statement-breakpoint
CREATE TABLE `review_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`abstract_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`assigned_by_id` text,
	`status` text DEFAULT 'assigned' NOT NULL,
	`due_at` integer,
	`assigned_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`abstract_id`) REFERENCES `abstract`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_assignment_reviewer` ON `review_assignment` (`reviewer_id`);--> statement-breakpoint
CREATE INDEX `ix_assignment_edition` ON `review_assignment` (`edition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assignment` ON `review_assignment` (`abstract_id`,`reviewer_id`);--> statement-breakpoint
CREATE TABLE `review_conflict` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`abstract_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`declared_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`abstract_id`) REFERENCES `abstract`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`declared_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_conflict` ON `review_conflict` (`abstract_id`,`reviewer_id`);--> statement-breakpoint
CREATE TABLE `review_score` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`score` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criterion_id`) REFERENCES `rubric_criterion`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_review_score` ON `review_score` (`review_id`,`criterion_id`);--> statement-breakpoint
CREATE TABLE `role_grant` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`edition_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`granted_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_role_grant_user` ON `role_grant` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_role_grant_edition` ON `role_grant` (`edition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_role_grant` ON `role_grant` (`user_id`,`role`,`edition_id`);--> statement-breakpoint
CREATE TABLE `rubric_criterion` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`scale_min` integer DEFAULT 1 NOT NULL,
	`scale_max` integer DEFAULT 5 NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `edition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_rubric_edition` ON `rubric_criterion` (`edition_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_verification_identifier` ON `verification` (`identifier`);