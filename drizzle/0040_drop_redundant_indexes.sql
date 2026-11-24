-- contract: drops three indexes already covered by the leading column of a unique constraint (uq_role_grant, uq_registration_user_edition, uq_book_entry); approved by Dustin 2026-11-24
DROP INDEX `ix_book_entry_book`;--> statement-breakpoint
DROP INDEX `ix_registration_edition`;--> statement-breakpoint
DROP INDEX `ix_role_grant_user`;