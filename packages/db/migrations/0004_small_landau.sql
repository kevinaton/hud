CREATE TABLE `airbnb_payout_items` (
	`id` integer PRIMARY KEY NOT NULL,
	`payout_id` integer NOT NULL,
	`confirmation_code` text NOT NULL,
	`guest_name` text,
	`amount_minor` integer NOT NULL,
	`date_range_start` text,
	`date_range_end` text,
	`listing_id` text,
	`listing_name` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`payout_id`) REFERENCES `airbnb_payouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_payitem_code` ON `airbnb_payout_items` (`confirmation_code`);--> statement-breakpoint
CREATE TABLE `airbnb_payouts` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`external_ref` text NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`payout_total_minor` integer NOT NULL,
	`sent_date` text,
	`expected_arrival_date` text,
	`bank_account_label` text,
	`airbnb_account_id` text,
	`source_log_entry_id` integer,
	`cashflow_transaction_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_log_entry_id`) REFERENCES `log_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cashflow_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payout_user_ref` ON `airbnb_payouts` (`user_id`,`external_ref`);--> statement-breakpoint
CREATE TABLE `airbnb_reservations` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`confirmation_code` text NOT NULL,
	`listing_id` text,
	`listing_name` text,
	`guest_name` text,
	`check_in` text,
	`check_out` text,
	`nights` integer,
	`guests_count` integer,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`gross_total_minor` integer,
	`cleaning_fee_minor` integer,
	`host_service_fee_minor` integer,
	`projected_earning_minor` integer,
	`realized_earning_minor` integer,
	`source_log_entry_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_log_entry_id`) REFERENCES `log_entries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_resv_status" CHECK(status IN ('confirmed','canceled','paid_out'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_resv_user_code` ON `airbnb_reservations` (`user_id`,`confirmation_code`);--> statement-breakpoint
CREATE INDEX `idx_resv_user_status` ON `airbnb_reservations` (`user_id`,`status`,`check_in`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`user_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `log_entries` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`source` text DEFAULT 'email' NOT NULL,
	`source_account` text NOT NULL,
	`external_ref` text NOT NULL,
	`sender` text NOT NULL,
	`subject` text,
	`received_at` text NOT NULL,
	`dkim_pass` integer DEFAULT 0 NOT NULL,
	`kind` text DEFAULT 'unknown' NOT NULL,
	`parser_version` text,
	`parsed_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_log_status" CHECK(status IN ('pending','recorded','rejected','parse_failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_log_entry_user_source_ref` ON `log_entries` (`user_id`,`source`,`external_ref`);--> statement-breakpoint
CREATE INDEX `idx_log_user_status` ON `log_entries` (`user_id`,`status`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_log_user_kind` ON `log_entries` (`user_id`,`kind`,`received_at`);--> statement-breakpoint
CREATE TABLE `log_raw` (
	`log_entry_id` integer PRIMARY KEY NOT NULL,
	`headers_json` text,
	`body_text` text,
	`body_html` text,
	FOREIGN KEY (`log_entry_id`) REFERENCES `log_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `log_rules` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`source` text DEFAULT 'email' NOT NULL,
	`sender` text,
	`kind` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_log_rule_action" CHECK(action IN ('auto_approve','ignore'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_log_rules` ON `log_rules` (`user_id`,`source`,`kind`,`action`);--> statement-breakpoint
CREATE TABLE `log_whitelist` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`source` text DEFAULT 'email' NOT NULL,
	`sender` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_whitelist_user_source_sender` ON `log_whitelist` (`user_id`,`source`,`sender`);--> statement-breakpoint
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
	CONSTRAINT "chk_audit_actor" CHECK(actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'system:_%' OR actor LIKE 'agent:%/%' OR actor LIKE 'platform:_%')
);
--> statement-breakpoint
INSERT INTO `__new_audit_log`("id", "user_id", "actor", "action", "entity", "entity_id", "payload_json", "ip_address", "user_agent", "created_at") SELECT "id", "user_id", "actor", "action", "entity", "entity_id", "payload_json", "ip_address", "user_agent", "created_at" FROM `audit_log`;--> statement-breakpoint
DROP TABLE `audit_log`;--> statement-breakpoint
ALTER TABLE `__new_audit_log` RENAME TO `audit_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_audit_user_time` ON `audit_log` (`user_id`,`created_at`);