CREATE TABLE `platform_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_name` text,
	`short_name` text,
	`org_full_name` text,
	`tagline` text,
	`founding_year` integer,
	`contact_email` text,
	`facebook_url` text,
	`footer_links` text,
	`default_currency` text DEFAULT 'usd' NOT NULL,
	`default_abstract_word_limit` integer DEFAULT 250 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
