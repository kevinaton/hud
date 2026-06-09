import { isNotNull, sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    source: text('source', { enum: ['manual', 'csv-import', 'agent'] })
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
    actor: text('actor').notNull(), // 'user' | 'anon' | 'system' | 'agent:*' | 'platform:*'
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
    // 'system' covers migrations/seeders; 'agent:<persona>/<cli>' covers HUD-internal agent tool calls;
    // 'platform:<name>' covers foreign platforms calling the MCP daemon (e.g. 'platform:hermes-gateway').
    check(
      'chk_audit_actor',
      sql`actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'agent:%/%' OR actor LIKE 'platform:_%'`,
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
  | 'import';
