/**
 * packages/db/seed.ts
 *
 * Idempotent dev seed. Safe to run multiple times — uses ON CONFLICT DO NOTHING.
 *
 * Creates:
 *   - 1 user: admin@hud.local (plain-text password for dev only)
 *   - 5 categories: varied kinds, no emoji
 *   - 3 transactions: distinct amounts, dates, categories
 *
 * Run via: pnpm db:seed (from repo root)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

// Type alias for the DB instance — avoids depending on the inferred type
type AnyDb = ReturnType<typeof drizzle>;

// ---------------------------------------------------------------------------
// Resolve DB path from env — paths relative to this file's location
// ---------------------------------------------------------------------------
const seedDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(seedDir, '../..');

// biome-ignore lint/complexity/useLiteralKeys: DATABASE_URL is a well-known env var name
const dbUrl = process.env['DATABASE_URL'] ?? `file:${path.join(projectRoot, 'data', 'hud.db')}`;
const rawPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl;
const dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(projectRoot, rawPath);

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

// Dev-only placeholder password hash.
// In production argon2id is used. This is intentionally weak — seed is
// guarded by NODE_ENV check below.
const DEV_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

async function main() {
  // biome-ignore lint/complexity/useLiteralKeys: NODE_ENV is a well-known env var name
  if (process.env['NODE_ENV'] === 'production') {
    // biome-ignore lint/suspicious/noConsole: seed is a CLI tool; console is intentional
    console.error('ERROR: db:seed must not be run in production');
    process.exit(1);
  }

  // biome-ignore lint/suspicious/noConsole: seed is a CLI tool; console is intentional
  console.log('Seeding database at:', dbPath);

  // -------------------------------------------------------------------------
  // User
  // -------------------------------------------------------------------------
  const [user] = await db
    .insert(schema.users)
    .values({
      email: 'admin@hud.local',
      passwordHash: DEV_PASSWORD_HASH,
      displayName: 'HUD Admin',
      failedAttempts: 0,
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning();

  // Fetch the user row regardless of whether we just inserted or it already existed
  const existingUser =
    user ?? (await db.select().from(schema.users).where(sql`email = 'admin@hud.local'`).get());

  if (!existingUser) {
    throw new Error('Failed to create or find seed user');
  }

  const userId = existingUser.id;
  // biome-ignore lint/suspicious/noConsole: seed is a CLI tool; console is intentional
  console.log(`User: ${existingUser.email} (id=${userId})`);

  // -------------------------------------------------------------------------
  // Categories (5, no emoji, varied kinds)
  // -------------------------------------------------------------------------
  const categorySeed = [
    { name: 'Airbnb', kind: 'income' as const },
    { name: 'Groceries', kind: 'expense' as const },
    { name: 'Transportation', kind: 'expense' as const },
    { name: 'Utilities', kind: 'expense' as const },
    { name: 'Savings Transfer', kind: 'transfer' as const },
  ];

  for (const cat of categorySeed) {
    await db
      .insert(schema.categories)
      .values({ userId, name: cat.name, kind: cat.kind })
      .onConflictDoNothing({ target: [schema.categories.userId, schema.categories.name] })
      .run();
  }

  // Fetch category IDs for transactions
  const cats = await db.select().from(schema.categories).where(sql`user_id = ${userId}`).all();

  const catByName = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  // biome-ignore lint/suspicious/noConsole: seed is a CLI tool; console is intentional
  console.log('Categories:', cats.map((c) => c.name).join(', '));

  // -------------------------------------------------------------------------
  // Transactions (3, distinct amounts, dates, categories)
  // -------------------------------------------------------------------------
  const transactionSeed = [
    {
      item: 'Airbnb June Payout',
      amountMinor: 1250000, // PHP 12,500.00 (income)
      currency: 'PHP',
      occurredAt: '2026-06-01T10:00:00+08:00',
      // biome-ignore lint/complexity/useLiteralKeys: catByName is a dynamic Record
      categoryId: catByName['Airbnb'] ?? null,
      source: 'manual' as const,
    },
    {
      item: 'Weekly Groceries',
      amountMinor: -340000, // PHP -3,400.00 (expense)
      currency: 'PHP',
      occurredAt: '2026-06-03T14:30:00+08:00',
      // biome-ignore lint/complexity/useLiteralKeys: catByName is a dynamic Record
      categoryId: catByName['Groceries'] ?? null,
      source: 'manual' as const,
    },
    {
      item: 'Jeepney Fare',
      amountMinor: -2800, // PHP -28.00 (expense)
      currency: 'PHP',
      occurredAt: '2026-06-05T08:15:00+08:00',
      // biome-ignore lint/complexity/useLiteralKeys: catByName is a dynamic Record
      categoryId: catByName['Transportation'] ?? null,
      source: 'manual' as const,
    },
  ];

  for (const tx of transactionSeed) {
    await db
      .insert(schema.transactions)
      .values({ userId, ...tx })
      .onConflictDoNothing()
      .run();
  }

  // biome-ignore lint/suspicious/noConsole: seed is a CLI tool; console is intentional
  console.log('Transactions: 3 seeded (or already existed)');

  // -------------------------------------------------------------------------
  // Logs pipeline defaults
  // -------------------------------------------------------------------------
  await seedLogsDefaults(db, userId);

  // biome-ignore lint/suspicious/noConsole: seed is a CLI tool; console is intentional
  console.log('Seed complete.');
}

// ---------------------------------------------------------------------------
// seedLogsDefaults — idempotent defaults for the logs pipeline
//
// These rows are required in BOTH dev and production for the ingest pipeline
// to work. They're safe to insert multiple times (ON CONFLICT DO NOTHING).
// ---------------------------------------------------------------------------
async function seedLogsDefaults(db: AnyDb, userId: number): Promise<void> {
  // Whitelist: automated@airbnb.com is the only whitelisted sender at launch
  await db
    .insert(schema.logWhitelist)
    .values({
      userId,
      source: 'email',
      sender: 'automated@airbnb.com',
      enabled: 1,
      note: 'Official Airbnb notification address',
    })
    .onConflictDoNothing({
      target: [schema.logWhitelist.userId, schema.logWhitelist.source, schema.logWhitelist.sender],
    })
    .run();

  // App setting: require manual approval before recording ingested entries
  await db
    .insert(schema.appSettings)
    .values({
      userId,
      key: 'logs.approval_required',
      value: 'true',
    })
    .onConflictDoNothing()
    .run();

  // biome-ignore lint/suspicious/noConsole: seed is a CLI tool; console is intentional
  console.log(
    'Logs defaults: whitelist row + approval_required setting seeded (or already existed)',
  );
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: seed is a CLI tool; console is intentional
  console.error('Seed failed:', err);
  process.exit(1);
});
