-- contract: drops three empty tables with no code (abstract_file, invitation, registration) and four columns nothing reads; approved by Dustin 2026-11-24
DROP TABLE `abstract_file`;--> statement-breakpoint
DROP TABLE `invitation`;--> statement-breakpoint
DROP TABLE `registration`;--> statement-breakpoint
ALTER TABLE `abstract_book` DROP COLUMN `numbering_scheme`;--> statement-breakpoint
ALTER TABLE `invited_speaker` DROP COLUMN `headshot_r2_key`;--> statement-breakpoint
ALTER TABLE `platform_settings` DROP COLUMN `default_currency`;--> statement-breakpoint
ALTER TABLE `sponsor` DROP COLUMN `logo_r2_key`;