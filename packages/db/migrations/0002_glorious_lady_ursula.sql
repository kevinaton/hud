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
	CONSTRAINT "chk_audit_actor" CHECK(actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'agent:%/%')
);
--> statement-breakpoint
INSERT INTO `__new_audit_log`("id", "user_id", "actor", "action", "entity", "entity_id", "payload_json", "ip_address", "user_agent", "created_at") SELECT "id", "user_id", "actor", "action", "entity", "entity_id", "payload_json", "ip_address", "user_agent", "created_at" FROM `audit_log`;--> statement-breakpoint
DROP TABLE `audit_log`;--> statement-breakpoint
ALTER TABLE `__new_audit_log` RENAME TO `audit_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_audit_user_time` ON `audit_log` (`user_id`,`created_at`);