/**
 * packages/mcp-hud/src/__tests__/cashflow.test.ts
 *
 * Vitest coverage for all 7 cashflow MCP tool handlers.
 *
 * Strategy: each test creates an in-memory SQLite database with the real
 * schema (including the audit_log CHECK constraint) and injects it via
 * the ToolCtx interface. No process.env manipulation needed — actor/userId
 * are passed directly in ctx.
 *
 * Per hud-money skill: amountMinor assertions use integers only.
 * Per hud-audit skill: write tool tests verify audit_log row is written
 *   with the correct actor matching the 'agent:<persona>/<cli>' pattern.
 */

import * as schema from '@hud/db';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ToolCtx } from '../tools/cashflow.js';
import {
  handleAdd,
  handleCategories,
  handleCreateCategory,
  handleDelete,
  handleEdit,
  handleList,
  handleSummary,
} from '../tools/cashflow.js';

// ---------------------------------------------------------------------------
// In-memory DB factory
//
// Mirrors the schema from packages/db/schema.ts — all tables + CHECK constraint.
// Each test gets a fresh in-memory DB (beforeEach) to ensure isolation.
// ---------------------------------------------------------------------------

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

function buildTestDb(): TestDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      avatar_path TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('expense', 'income', 'transfer')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );

    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      item TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'PHP',
      occurred_at TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'csv-import', 'agent')),
      external_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      payload_json TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CONSTRAINT chk_audit_actor CHECK(
        actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'agent:%/%'
      )
    );
  `);

  return drizzle(sqlite, { schema });
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ACTOR = 'agent:emily/gemini';
const TEST_EMAIL = 'test@hud.local';

/** Seed a single user and return their id. */
function seedUser(db: TestDb): number {
  const row = db
    .insert(schema.users)
    .values({ email: TEST_EMAIL, passwordHash: 'hash-irrelevant' })
    .returning({ id: schema.users.id })
    .get();
  if (!row) throw new Error('seedUser: insert returned no row');
  return row.id;
}

/** Seed a category and return its id. */
function seedCategory(
  db: TestDb,
  userId: number,
  name: string,
  kind: 'expense' | 'income' | 'transfer' = 'expense',
): number {
  const row = db
    .insert(schema.categories)
    .values({ userId, name, kind })
    .returning({ id: schema.categories.id })
    .get();
  if (!row) throw new Error('seedCategory: insert returned no row');
  return row.id;
}

/** Seed a transaction and return its id. */
function seedTransaction(
  db: TestDb,
  userId: number,
  opts: {
    item?: string;
    amountMinor?: number;
    occurredAt?: string;
    categoryId?: number | null;
    notes?: string | null;
  } = {},
): number {
  const row = db
    .insert(schema.transactions)
    .values({
      userId,
      item: opts.item ?? 'Test item',
      amountMinor: opts.amountMinor ?? -5000,
      currency: 'PHP',
      occurredAt: opts.occurredAt ?? '2026-06-01T10:00:00+08:00',
      categoryId: opts.categoryId ?? null,
      notes: opts.notes ?? null,
      source: 'manual',
    })
    .returning({ id: schema.transactions.id })
    .get();
  if (!row) throw new Error('seedTransaction: insert returned no row');
  return row.id;
}

type ToolResponse = Awaited<ReturnType<typeof handleAdd>>;

/** Parse the text content from a tool response as a typed value. */
function parseResponse<T>(response: ToolResponse): T {
  const text = response.content[0]?.text;
  if (!text) throw new Error('Empty tool response');
  return JSON.parse(text) as T;
}

/** Get all audit_log rows for a given userId. */
function getAuditRows(db: TestDb, userId: number): schema.AuditLogRow[] {
  return db.select().from(schema.auditLog).where(eq(schema.auditLog.userId, userId)).all();
}

// ---------------------------------------------------------------------------
// Common error shape
// ---------------------------------------------------------------------------
interface ErrorResponse {
  error: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

let testDb: TestDb;
let userId: number;
let ctx: ToolCtx;

beforeEach(() => {
  testDb = buildTestDb();
  userId = seedUser(testDb);
  ctx = { actor: ACTOR, userId, db: testDb };
});

// ---------------------------------------------------------------------------
// cashflow.add
// ---------------------------------------------------------------------------
describe('cashflow.add', () => {
  it('happy path: inserts a transaction and returns the row', async () => {
    const res = await handleAdd(
      {
        item: 'Grocery run',
        amountMinor: -4210,
        currency: 'USD',
        occurredAt: '2026-06-05T10:00:00+08:00',
      },
      ctx,
    );
    const data = parseResponse<schema.Transaction>(res);
    expect(data.item).toBe('Grocery run');
    expect(data.amountMinor).toBe(-4210);
    expect(data.currency).toBe('USD');
    expect(data.source).toBe('agent');
    expect(typeof data.id).toBe('number');
  });

  it('happy path: writes exactly one audit_log row with correct actor', async () => {
    await handleAdd(
      {
        item: 'Coffee',
        amountMinor: -15000,
        currency: 'PHP',
        occurredAt: '2026-06-05T08:00:00+08:00',
      },
      ctx,
    );
    const auditRows = getAuditRows(testDb, userId);
    expect(auditRows).toHaveLength(1);
    const row = auditRows[0];
    expect(row?.actor).toBe('agent:emily/gemini');
    expect(row?.action).toBe('create');
    expect(row?.entity).toBe('transaction');
  });

  it('returns { error: "Unauthorized" } when actor is null', async () => {
    const noActorCtx: ToolCtx = { ...ctx, actor: null };
    const res = await handleAdd(
      { item: 'X', amountMinor: -100, currency: 'PHP', occurredAt: '2026-06-01T10:00:00+08:00' },
      noActorCtx,
    );
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'Unauthorized' });
  });

  it('returns { error: "Unauthorized" } when userId is null', async () => {
    const noUserCtx: ToolCtx = { ...ctx, userId: null };
    const res = await handleAdd(
      { item: 'X', amountMinor: -100, currency: 'PHP', occurredAt: '2026-06-01T10:00:00+08:00' },
      noUserCtx,
    );
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'Unauthorized' });
  });

  it('ValidationError: missing required field (item)', async () => {
    const res = await handleAdd(
      { amountMinor: -100, currency: 'PHP', occurredAt: '2026-06-01T10:00:00+08:00' },
      ctx,
    );
    expect(parseResponse<ErrorResponse>(res).error).toBe('ValidationError');
  });

  it('ValidationError: amountMinor is a float (z.number().int() rejects)', async () => {
    const res = await handleAdd(
      { item: 'Test', amountMinor: 42.1, currency: 'PHP', occurredAt: '2026-06-01T10:00:00+08:00' },
      ctx,
    );
    expect(parseResponse<ErrorResponse>(res).error).toBe('ValidationError');
  });

  it('accepts optional categoryId and notes', async () => {
    const catId = seedCategory(testDb, userId, 'Groceries');
    const res = await handleAdd(
      {
        item: 'Mango',
        amountMinor: -5000,
        currency: 'PHP',
        occurredAt: '2026-06-05T10:00:00+08:00',
        categoryId: catId,
        notes: 'fresh mango',
      },
      ctx,
    );
    const data = parseResponse<schema.Transaction>(res);
    expect(data.categoryId).toBe(catId);
    expect(data.notes).toBe('fresh mango');
  });
});

// ---------------------------------------------------------------------------
// cashflow.edit
// ---------------------------------------------------------------------------
describe('cashflow.edit', () => {
  it('happy path: updates a transaction and returns the updated row', async () => {
    const txId = seedTransaction(testDb, userId, { item: 'Old item', amountMinor: -1000 });
    const res = await handleEdit(
      { id: txId, patch: { item: 'New item', amountMinor: -2000 } },
      ctx,
    );
    const data = parseResponse<schema.Transaction>(res);
    expect(data.item).toBe('New item');
    expect(data.amountMinor).toBe(-2000);
  });

  it('happy path: writes exactly one audit_log row with correct actor', async () => {
    const txId = seedTransaction(testDb, userId, { amountMinor: -1000 });
    await handleEdit({ id: txId, patch: { amountMinor: -1500 } }, ctx);
    const auditRows = getAuditRows(testDb, userId);
    expect(auditRows).toHaveLength(1);
    const row = auditRows[0];
    expect(row?.actor).toBe('agent:emily/gemini');
    expect(row?.action).toBe('update');
  });

  it('NotFound: transaction does not exist', async () => {
    const res = await handleEdit({ id: 99999, patch: { item: 'X' } }, ctx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'NotFound' });
  });

  it('NotFound: transaction belongs to different user', async () => {
    const otherUserId = testDb
      .insert(schema.users)
      .values({ email: 'other@hud.local', passwordHash: 'hash' })
      .returning({ id: schema.users.id })
      .get()?.id;
    if (!otherUserId) throw new Error('Could not create other user');

    const otherTxId = seedTransaction(testDb, otherUserId);
    const res = await handleEdit({ id: otherTxId, patch: { item: 'Stolen' } }, ctx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'NotFound' });
  });

  it('returns { error: "Unauthorized" } when actor is null', async () => {
    const txId = seedTransaction(testDb, userId);
    const noActorCtx: ToolCtx = { ...ctx, actor: null };
    const res = await handleEdit({ id: txId, patch: { item: 'X' } }, noActorCtx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'Unauthorized' });
  });

  it('ValidationError: amountMinor is a float', async () => {
    const txId = seedTransaction(testDb, userId);
    const res = await handleEdit({ id: txId, patch: { amountMinor: 10.5 } }, ctx);
    expect(parseResponse<ErrorResponse>(res).error).toBe('ValidationError');
  });
});

// ---------------------------------------------------------------------------
// cashflow.delete
// ---------------------------------------------------------------------------
describe('cashflow.delete', () => {
  it('happy path: deletes a transaction and returns { ok: true }', async () => {
    const txId = seedTransaction(testDb, userId);
    const res = await handleDelete({ id: txId }, ctx);
    expect(parseResponse<{ ok: boolean }>(res)).toMatchObject({ ok: true });

    const remaining = testDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, txId))
      .all();
    expect(remaining).toHaveLength(0);
  });

  it('happy path: writes exactly one audit_log row with correct actor', async () => {
    const txId = seedTransaction(testDb, userId);
    await handleDelete({ id: txId }, ctx);
    const auditRows = getAuditRows(testDb, userId);
    expect(auditRows).toHaveLength(1);
    const row = auditRows[0];
    expect(row?.actor).toBe('agent:emily/gemini');
    expect(row?.action).toBe('delete');
  });

  it('NotFound: transaction does not exist', async () => {
    const res = await handleDelete({ id: 99999 }, ctx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'NotFound' });
  });

  it('NotFound: transaction belongs to different user', async () => {
    const otherUserId = testDb
      .insert(schema.users)
      .values({ email: 'other2@hud.local', passwordHash: 'hash' })
      .returning({ id: schema.users.id })
      .get()?.id;
    if (!otherUserId) throw new Error('Could not create other user');

    const otherTxId = seedTransaction(testDb, otherUserId);
    const res = await handleDelete({ id: otherTxId }, ctx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'NotFound' });
  });

  it('returns { error: "Unauthorized" } when actor is null', async () => {
    const txId = seedTransaction(testDb, userId);
    const noActorCtx: ToolCtx = { ...ctx, actor: null };
    const res = await handleDelete({ id: txId }, noActorCtx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'Unauthorized' });
  });

  it('ValidationError: id is not an integer', async () => {
    const res = await handleDelete({ id: 1.5 }, ctx);
    expect(parseResponse<ErrorResponse>(res).error).toBe('ValidationError');
  });
});

// ---------------------------------------------------------------------------
// cashflow.list
// ---------------------------------------------------------------------------
describe('cashflow.list', () => {
  it('happy path: returns transactions for specified month', async () => {
    seedTransaction(testDb, userId, { item: 'June tx', occurredAt: '2026-06-10T10:00:00+08:00' });
    seedTransaction(testDb, userId, { item: 'May tx', occurredAt: '2026-05-10T10:00:00+08:00' });

    const res = await handleList({ year: 2026, month: 6 }, ctx);
    const rows = parseResponse<schema.Transaction[]>(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.item).toBe('June tx');
  });

  it('happy path: includes categoryName in results', async () => {
    const catId = seedCategory(testDb, userId, 'Groceries');
    seedTransaction(testDb, userId, {
      item: 'Market',
      categoryId: catId,
      occurredAt: '2026-06-01T10:00:00+08:00',
    });

    const res = await handleList({ year: 2026, month: 6 }, ctx);
    const rows = parseResponse<Array<schema.Transaction & { categoryName: string | null }>>(res);
    expect(rows[0]?.categoryName).toBe('Groceries');
  });

  it('returns empty array when no transactions in period', async () => {
    const res = await handleList({ year: 2024, month: 1 }, ctx);
    const rows = parseResponse<unknown[]>(res);
    expect(rows).toHaveLength(0);
  });

  it('returns { error: "Unauthorized" } when userId is null', async () => {
    const noUserCtx: ToolCtx = { ...ctx, userId: null };
    const res = await handleList({ year: 2026, month: 6 }, noUserCtx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'Unauthorized' });
  });

  it('ValidationError: month out of range', async () => {
    const res = await handleList({ year: 2026, month: 13 }, ctx);
    expect(parseResponse<ErrorResponse>(res).error).toBe('ValidationError');
  });

  it("returns only the owning user's transactions", async () => {
    const otherUserId = testDb
      .insert(schema.users)
      .values({ email: 'other3@hud.local', passwordHash: 'hash' })
      .returning({ id: schema.users.id })
      .get()?.id;
    if (!otherUserId) throw new Error('Could not create other user');

    seedTransaction(testDb, userId, { item: 'Mine', occurredAt: '2026-06-01T10:00:00+08:00' });
    seedTransaction(testDb, otherUserId, {
      item: 'Theirs',
      occurredAt: '2026-06-01T10:00:00+08:00',
    });

    const res = await handleList({ year: 2026, month: 6 }, ctx);
    const rows = parseResponse<schema.Transaction[]>(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.item).toBe('Mine');
  });
});

// ---------------------------------------------------------------------------
// cashflow.summary
// ---------------------------------------------------------------------------

interface SummaryResponse {
  net: number;
  gross: number;
  expense: number;
  deltas: {
    net: number | null;
    gross: number | null;
    expense: number | null;
  };
}

describe('cashflow.summary', () => {
  it('happy path: returns net, gross, expense, and deltas', async () => {
    // Current month (June 2026)
    seedTransaction(testDb, userId, {
      amountMinor: 100000,
      occurredAt: '2026-06-01T10:00:00+08:00',
    });
    seedTransaction(testDb, userId, {
      amountMinor: -30000,
      occurredAt: '2026-06-02T10:00:00+08:00',
    });
    // Prior month (May 2026)
    seedTransaction(testDb, userId, {
      amountMinor: 80000,
      occurredAt: '2026-05-01T10:00:00+08:00',
    });
    seedTransaction(testDb, userId, {
      amountMinor: -20000,
      occurredAt: '2026-05-02T10:00:00+08:00',
    });

    const res = await handleSummary({ year: 2026, month: 6 }, ctx);
    const data = parseResponse<SummaryResponse>(res);

    // net = 100000 + (-30000) = 70000
    expect(data.net).toBe(70000);
    // gross = 100000
    expect(data.gross).toBe(100000);
    // expense = 30000
    expect(data.expense).toBe(30000);

    // gross delta: (100000 - 80000) / 80000 * 100 = 25
    expect(data.deltas.gross).toBe(25);
    // expense delta: (30000 - 20000) / 20000 * 100 = 50
    expect(data.deltas.expense).toBe(50);
    // net delta is a number
    expect(typeof data.deltas.net).toBe('number');
  });

  it('returns null deltas when prior period has zero amounts', async () => {
    seedTransaction(testDb, userId, {
      amountMinor: 50000,
      occurredAt: '2026-06-01T10:00:00+08:00',
    });
    // No May transactions — prior gross = 0

    const res = await handleSummary({ year: 2026, month: 6 }, ctx);
    const data = parseResponse<SummaryResponse>(res);
    expect(data.deltas.gross).toBeNull();
  });

  it('returns zeros when no transactions in period', async () => {
    const res = await handleSummary({ year: 2024, month: 1 }, ctx);
    const data = parseResponse<SummaryResponse>(res);
    expect(data.net).toBe(0);
    expect(data.gross).toBe(0);
    expect(data.expense).toBe(0);
  });

  it('returns { error: "Unauthorized" } when userId is null', async () => {
    const noUserCtx: ToolCtx = { ...ctx, userId: null };
    const res = await handleSummary({ year: 2026, month: 6 }, noUserCtx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'Unauthorized' });
  });

  it('ValidationError: month out of range', async () => {
    const res = await handleSummary({ year: 2026, month: 0 }, ctx);
    expect(parseResponse<ErrorResponse>(res).error).toBe('ValidationError');
  });
});

// ---------------------------------------------------------------------------
// cashflow.categories
// ---------------------------------------------------------------------------

interface CategoryRow {
  id: number;
  name: string;
  kind: string;
}

describe('cashflow.categories', () => {
  it('happy path: returns all categories for the user', async () => {
    seedCategory(testDb, userId, 'Food', 'expense');
    seedCategory(testDb, userId, 'Salary', 'income');

    const res = await handleCategories({}, ctx);
    const rows = parseResponse<CategoryRow[]>(res);
    expect(rows).toHaveLength(2);
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(['Food', 'Salary']);
  });

  it('returns empty array when user has no categories', async () => {
    const res = await handleCategories({}, ctx);
    const rows = parseResponse<unknown[]>(res);
    expect(rows).toHaveLength(0);
  });

  it('returns { error: "Unauthorized" } when userId is null', async () => {
    const noUserCtx: ToolCtx = { ...ctx, userId: null };
    const res = await handleCategories({}, noUserCtx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'Unauthorized' });
  });

  it("returns only the owning user's categories", async () => {
    const otherUserId = testDb
      .insert(schema.users)
      .values({ email: 'other4@hud.local', passwordHash: 'hash' })
      .returning({ id: schema.users.id })
      .get()?.id;
    if (!otherUserId) throw new Error('Could not create other user');

    seedCategory(testDb, userId, 'Mine', 'expense');
    seedCategory(testDb, otherUserId, 'Theirs', 'expense');

    const res = await handleCategories({}, ctx);
    const rows = parseResponse<CategoryRow[]>(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Mine');
  });
});

// ---------------------------------------------------------------------------
// cashflow.createCategory
// ---------------------------------------------------------------------------
describe('cashflow.createCategory', () => {
  it('happy path: creates a category and returns the row', async () => {
    const res = await handleCreateCategory({ name: 'Groceries', kind: 'expense' }, ctx);
    const data = parseResponse<schema.Category>(res);
    expect(data.name).toBe('Groceries');
    expect(data.kind).toBe('expense');
    expect(typeof data.id).toBe('number');
  });

  it('happy path: writes exactly one audit_log row with correct actor', async () => {
    await handleCreateCategory({ name: 'Transport', kind: 'expense' }, ctx);
    const auditRows = getAuditRows(testDb, userId);
    expect(auditRows).toHaveLength(1);
    const row = auditRows[0];
    expect(row?.actor).toBe('agent:emily/gemini');
    expect(row?.action).toBe('create');
    expect(row?.entity).toBe('category');
  });

  it('strips emoji from category name before storing', async () => {
    const res = await handleCreateCategory({ name: '🛒 Groceries 🛒', kind: 'expense' }, ctx);
    const data = parseResponse<schema.Category>(res);
    expect(data.name).toBe('Groceries');
  });

  it('ValidationError: category already exists (unique constraint)', async () => {
    seedCategory(testDb, userId, 'Groceries');
    const res = await handleCreateCategory({ name: 'Groceries', kind: 'expense' }, ctx);
    expect(parseResponse<ErrorResponse>(res).error).toBe('ValidationError');
  });

  it('ValidationError: empty name after emoji strip', async () => {
    const res = await handleCreateCategory({ name: '🛒', kind: 'expense' }, ctx);
    expect(parseResponse<ErrorResponse>(res).error).toBe('ValidationError');
  });

  it('ValidationError: invalid kind', async () => {
    const res = await handleCreateCategory({ name: 'Test', kind: 'invalid' as 'expense' }, ctx);
    expect(parseResponse<ErrorResponse>(res).error).toBe('ValidationError');
  });

  it('returns { error: "Unauthorized" } when actor is null', async () => {
    const noActorCtx: ToolCtx = { ...ctx, actor: null };
    const res = await handleCreateCategory({ name: 'X', kind: 'expense' }, noActorCtx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'Unauthorized' });
  });

  it('returns { error: "Unauthorized" } when userId is null', async () => {
    const noUserCtx: ToolCtx = { ...ctx, userId: null };
    const res = await handleCreateCategory({ name: 'X', kind: 'expense' }, noUserCtx);
    expect(parseResponse<ErrorResponse>(res)).toMatchObject({ error: 'Unauthorized' });
  });

  it('audit_log.actor matches agent:<persona>/<cli> pattern', async () => {
    await handleCreateCategory({ name: 'Salary', kind: 'income' }, ctx);
    const auditRows = getAuditRows(testDb, userId);
    expect(auditRows).toHaveLength(1);
    const actor = auditRows[0]?.actor ?? '';
    // Pattern: agent:<persona>/<cli> — colon + slash both required
    expect(actor).toMatch(/^agent:[^/]+\/[^/]+$/);
    expect(actor).toBe('agent:emily/gemini');
  });
});

// ---------------------------------------------------------------------------
// Cross-tool audit_log actor pattern verification
// ---------------------------------------------------------------------------
describe('audit_log actor pattern — write tools', () => {
  it('cashflow.add writes agent:<persona>/<cli> actor', async () => {
    await handleAdd(
      { item: 'X', amountMinor: -100, currency: 'PHP', occurredAt: '2026-06-01T10:00:00+08:00' },
      ctx,
    );
    const rows = getAuditRows(testDb, userId);
    expect(rows[0]?.actor).toMatch(/^agent:[^/]+\/[^/]+$/);
  });

  it('cashflow.edit writes agent:<persona>/<cli> actor', async () => {
    const txId = seedTransaction(testDb, userId);
    await handleEdit({ id: txId, patch: { item: 'Updated' } }, ctx);
    const rows = getAuditRows(testDb, userId);
    expect(rows[0]?.actor).toMatch(/^agent:[^/]+\/[^/]+$/);
  });

  it('cashflow.delete writes agent:<persona>/<cli> actor', async () => {
    const txId = seedTransaction(testDb, userId);
    await handleDelete({ id: txId }, ctx);
    const rows = getAuditRows(testDb, userId);
    expect(rows[0]?.actor).toMatch(/^agent:[^/]+\/[^/]+$/);
  });

  it('cashflow.createCategory writes agent:<persona>/<cli> actor', async () => {
    await handleCreateCategory({ name: 'Dining', kind: 'expense' }, ctx);
    const rows = getAuditRows(testDb, userId);
    expect(rows[0]?.actor).toMatch(/^agent:[^/]+\/[^/]+$/);
  });
});
