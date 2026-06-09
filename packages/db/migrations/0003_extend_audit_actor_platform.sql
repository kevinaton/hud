-- Migration: extend audit_log.actor CHECK constraint to allow platform:<name> prefix
--
-- SQLite does not support ALTER TABLE … DROP CONSTRAINT, so the canonical approach
-- (also used in 0002_glorious_lady_ursula.sql) is:
--   1. Create a new table with the updated constraint
--   2. Copy all rows from the old table
--   3. Drop the old table
--   4. Rename the new table
--   5. Recreate indexes
--
-- Old four-arm constraint (from 0002):
--   actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'agent:%/%'
--
-- New five-arm constraint:
--   actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'agent:%/%' OR actor LIKE 'platform:_%'
--
-- Note: 'platform:_%' (underscore before percent) requires at least one character
-- after the colon, so 'platform:' with an empty suffix is correctly rejected.
--
-- All existing rows in audit_log already satisfy the new constraint because the
-- new arm is purely additive — no existing value is invalidated.

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_log` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`payload_json` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_audit_actor" CHECK(actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'agent:%/%' OR actor LIKE 'platform:_%')
);
--> statement-breakpoint
INSERT INTO `__new_audit_log`("id", "user_id", "actor", "action", "entity", "entity_id", "payload_json", "ip_address", "user_agent", "created_at") SELECT "id", "user_id", "actor", "action", "entity", "entity_id", "payload_json", "ip_address", "user_agent", "created_at" FROM `audit_log`;--> statement-breakpoint
DROP TABLE `audit_log`;--> statement-breakpoint
ALTER TABLE `__new_audit_log` RENAME TO `audit_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_audit_user_time` ON `audit_log` (`user_id`,`created_at`);
