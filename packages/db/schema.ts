import { isNotNull, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  avatarPath: text('avatar_path'),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: text('locked_until'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(), // sha256 of the opaque cookie token
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_sessions_user').on(table.userId)],
);

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------
export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(), // normalized, NO emoji
    kind: text('kind', { enum: ['expense', 'income', 'transfer'] }).notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex('uq_categories_user_name').on(table.userId, table.name)],
);

// ---------------------------------------------------------------------------
// transactions
// ---------------------------------------------------------------------------
export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    item: text('item').notNull(),
    amountMinor: integer('amount_minor').notNull(), // signed centavos — NEVER float
    currency: text('currency').notNull().default('PHP'),
    occurredAt: text('occurred_at').notNull(), // ISO-8601 with TZ offset
    categoryId: integer('category_id').references(() => categories.id),
    notes: text('notes'),
    source: text('source', { enum: ['manual', 'csv-import', 'agent', 'airbnb'] })
      .notNull()
      .default('manual'),
    externalId: text('external_id'), // legacy id for csv re-imports
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_tx_user_date').on(table.userId, table.occurredAt),
    index('idx_tx_user_cat').on(table.userId, table.categoryId),
    // Partial unique index for idempotent CSV import — only enforced where external_id IS NOT NULL
    uniqueIndex('idx_tx_external')
      .on(table.userId, table.externalId)
      .where(isNotNull(table.externalId)),
  ],
);

// ---------------------------------------------------------------------------
// audit_log
// ---------------------------------------------------------------------------
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    actor: text('actor').notNull(), // 'user' | 'anon' | 'system' | 'system:*' | 'agent:*' | 'platform:*'
    action: text('action').notNull(), // see AuditAction type
    entity: text('entity').notNull(), // 'transaction' | 'category' | 'user' | 'session'
    entityId: text('entity_id'),
    payloadJson: text('payload_json'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_audit_user_time').on(table.userId, table.createdAt),
    // Prefix-based constraint: adding a new persona/CLI is data-only, no migration needed.
    // 'anon' covers pre-auth events (login attempts, signup); 'user' covers browser sessions;
    // 'system' covers migrations/seeders; 'system:<job>' covers scheduled workers (e.g.
    // 'system:logs-ingest', 'system:logs-payout'); 'agent:<persona>/<cli>' covers HUD-internal
    // agent tool calls; 'platform:<name>' covers foreign platforms (e.g. 'platform:hermes-gateway').
    check(
      'chk_audit_actor',
      sql`actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'system:_%' OR actor LIKE 'agent:%/%' OR actor LIKE 'platform:_%'`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// TypeScript types inferred from schema
// ---------------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;

export type AuditAction =
  | 'signup'
  | 'login'
  | 'login_fail'
  | 'lockout'
  | 'logout'
  | 'session_expire'
  | 'password_reset'
  | 'create'
  | 'update'
  | 'delete'
  | 'import'
  | 'approve'
  | 'reject';

// ---------------------------------------------------------------------------
// log_whitelist — manual sender allow-list for email ingestion
// ---------------------------------------------------------------------------
export const logWhitelist = sqliteTable(
  'log_whitelist',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    source: text('source').notNull().default('email'),
    sender: text('sender').notNull(),
    enabled: integer('enabled').notNull().default(1), // 1 = true, 0 = false
    note: text('note'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('uq_whitelist_user_source_sender').on(table.userId, table.source, table.sender),
  ],
);

// ---------------------------------------------------------------------------
// log_entries — one row per ingested email (source-agnostic spine)
// ---------------------------------------------------------------------------
export const logEntries = sqliteTable(
  'log_entries',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    source: text('source').notNull().default('email'),
    sourceAccount: text('source_account').notNull(), // e.g. 'jarvismolt8@gmail.com'
    externalRef: text('external_ref').notNull(), // Gmail message id — idempotency key
    sender: text('sender').notNull(),
    subject: text('subject'),
    receivedAt: text('received_at').notNull(), // ISO-8601 from message internalDate
    dkimPass: integer('dkim_pass').notNull().default(0), // 1 = verified for airbnb.com
    kind: text('kind').notNull().default('unknown'), // 'airbnb.reservation_confirmed' | etc.
    parserVersion: text('parser_version'),
    parsedJson: text('parsed_json'), // structured extraction — never raw body
    status: text('status').notNull().default('pending'),
    statusReason: text('status_reason'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('uq_log_entry_user_source_ref').on(table.userId, table.source, table.externalRef),
    index('idx_log_user_status').on(table.userId, table.status, table.receivedAt),
    index('idx_log_user_kind').on(table.userId, table.kind, table.receivedAt),
    check('chk_log_status', sql`status IN ('pending','recorded','rejected','parse_failed')`),
  ],
);

// ---------------------------------------------------------------------------
// log_raw — raw headers + body stored before parsing (enables re-parse)
// ---------------------------------------------------------------------------
export const logRaw = sqliteTable('log_raw', {
  logEntryId: integer('log_entry_id')
    .primaryKey()
    .references(() => logEntries.id, { onDelete: 'cascade' }),
  headersJson: text('headers_json'),
  bodyText: text('body_text'),
  bodyHtml: text('body_html'),
});

// ---------------------------------------------------------------------------
// log_rules — auto_approve / ignore rules ("do not ask again")
// ---------------------------------------------------------------------------
export const logRules = sqliteTable(
  'log_rules',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    source: text('source').notNull().default('email'),
    sender: text('sender'), // null = any sender
    kind: text('kind').notNull(), // which classified kind this rule applies to
    action: text('action').notNull(), // 'auto_approve' | 'ignore'
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('uq_log_rules').on(table.userId, table.source, table.kind, table.action),
    check('chk_log_rule_action', sql`action IN ('auto_approve','ignore')`),
  ],
);

// ---------------------------------------------------------------------------
// app_settings — generic per-user key/value store (approval toggle, etc.)
// ---------------------------------------------------------------------------
export const appSettings = sqliteTable(
  'app_settings',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);

// ---------------------------------------------------------------------------
// airbnb_reservations — per-booking record (keyed by confirmation code)
// ---------------------------------------------------------------------------
export const airbnbReservations = sqliteTable(
  'airbnb_reservations',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    confirmationCode: text('confirmation_code').notNull(), // HM[A-Z0-9]{8}
    listingId: text('listing_id'),
    listingName: text('listing_name'),
    guestName: text('guest_name'),
    checkIn: text('check_in'), // ISO date
    checkOut: text('check_out'),
    nights: integer('nights'),
    guestsCount: integer('guests_count'),
    status: text('status').notNull().default('confirmed'),
    currency: text('currency').notNull().default('PHP'),
    grossTotalMinor: integer('gross_total_minor'), // centavos — INTEGER per hud-money
    cleaningFeeMinor: integer('cleaning_fee_minor'),
    hostServiceFeeMinor: integer('host_service_fee_minor'), // signed negative
    projectedEarningMinor: integer('projected_earning_minor'), // "You earn" from confirmed email
    realizedEarningMinor: integer('realized_earning_minor'), // from payout item (authoritative)
    sourceLogEntryId: integer('source_log_entry_id').references(() => logEntries.id),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('uq_resv_user_code').on(table.userId, table.confirmationCode),
    index('idx_resv_user_status').on(table.userId, table.status, table.checkIn),
    check('chk_resv_status', sql`status IN ('confirmed','canceled','paid_out')`),
  ],
);

// ---------------------------------------------------------------------------
// airbnb_payouts — one payout email = one row
// ---------------------------------------------------------------------------
export const airbnbPayouts = sqliteTable(
  'airbnb_payouts',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    externalRef: text('external_ref').notNull(), // Gmail message id of payout email
    currency: text('currency').notNull().default('PHP'),
    payoutTotalMinor: integer('payout_total_minor').notNull(), // ₱49,878.59 → 4987859
    sentDate: text('sent_date'),
    expectedArrivalDate: text('expected_arrival_date'),
    bankAccountLabel: text('bank_account_label'), // 'Kevin Aton, 4131 (PHP)'
    airbnbAccountId: text('airbnb_account_id'),
    sourceLogEntryId: integer('source_log_entry_id').references(() => logEntries.id),
    cashflowTransactionId: integer('cashflow_transaction_id').references(() => transactions.id),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex('uq_payout_user_ref').on(table.userId, table.externalRef)],
);

// ---------------------------------------------------------------------------
// airbnb_payout_items — per-reservation line item within a payout
// ---------------------------------------------------------------------------
export const airbnbPayoutItems = sqliteTable(
  'airbnb_payout_items',
  {
    id: integer('id').primaryKey(),
    payoutId: integer('payout_id')
      .notNull()
      .references(() => airbnbPayouts.id, { onDelete: 'cascade' }),
    confirmationCode: text('confirmation_code').notNull(), // joins airbnb_reservations
    guestName: text('guest_name'),
    amountMinor: integer('amount_minor').notNull(), // net for this reservation — centavos INTEGER
    dateRangeStart: text('date_range_start'),
    dateRangeEnd: text('date_range_end'),
    listingId: text('listing_id'),
    listingName: text('listing_name'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_payitem_code').on(table.confirmationCode)],
);

// ---------------------------------------------------------------------------
// TypeScript types — new tables
// ---------------------------------------------------------------------------
export type LogWhitelist = typeof logWhitelist.$inferSelect;
export type NewLogWhitelist = typeof logWhitelist.$inferInsert;

export type LogEntry = typeof logEntries.$inferSelect;
export type NewLogEntry = typeof logEntries.$inferInsert;

export type LogRaw = typeof logRaw.$inferSelect;
export type NewLogRaw = typeof logRaw.$inferInsert;

export type LogRule = typeof logRules.$inferSelect;
export type NewLogRule = typeof logRules.$inferInsert;

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

export type AirbnbReservation = typeof airbnbReservations.$inferSelect;
export type NewAirbnbReservation = typeof airbnbReservations.$inferInsert;

export type AirbnbPayout = typeof airbnbPayouts.$inferSelect;
export type NewAirbnbPayout = typeof airbnbPayouts.$inferInsert;

export type AirbnbPayoutItem = typeof airbnbPayoutItems.$inferSelect;
export type NewAirbnbPayoutItem = typeof airbnbPayoutItems.$inferInsert;
