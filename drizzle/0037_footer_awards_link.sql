-- The footer's Awards link was saved as /awards, which permanently redirects to /awardees. Point it at /awardees so
-- every page links to the final URL (Prelum's link-redirect audit counted it on every page).
UPDATE `platform_settings` SET `footer_links` = REPLACE(`footer_links`, '"url":"/awards"', '"url":"/awardees"') WHERE `footer_links` LIKE '%"url":"/awards"%';
