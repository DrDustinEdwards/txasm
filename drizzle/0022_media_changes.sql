-- The media library's change log (schema.ts, media_change): every insert, update and delete of a
-- media row appends its key, so Carrel's library poll (site-api changedSince) sees each change
-- however it was written. Triggers rather than a write in each writer, so none can be missed.
-- A custom migration (drizzle-kit generate --custom): drizzle-kit does not write triggers.
CREATE TRIGGER `media_change_insert` AFTER INSERT ON `media` BEGIN
	INSERT INTO `media_change` (`media_key`) VALUES (NEW.`key`);
END;
--> statement-breakpoint
CREATE TRIGGER `media_change_update` AFTER UPDATE ON `media` BEGIN
	INSERT INTO `media_change` (`media_key`) VALUES (NEW.`key`);
END;
--> statement-breakpoint
CREATE TRIGGER `media_change_delete` AFTER DELETE ON `media` BEGIN
	INSERT INTO `media_change` (`media_key`) VALUES (OLD.`key`);
END;
