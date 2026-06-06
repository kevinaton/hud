/**
 * app/api/transactions/[id]/__tests__/route.test.ts
 *
 * Unit tests for PUT /api/transactions/[id] and DELETE /api/transactions/[id].
 *
 * Test cases (per Ticket 10 AC):
 *
 * PUT:
 *   1.  No session            → 401
 *   2.  Invalid CSRF          → 403
 *   3.  Transaction not owned → 403
 *   4.  Invalid body (amount=0) → 400
 *   5.  Valid update          → 200, 1 transaction updated, 1 audit_log row (action=update)
 *   6.  Audit payload is diff-only (before/after)
 *
 * DELETE:
 *   7.  No session            → 401
 *   8.  Invalid CSRF          → 403
 *   9.  Transaction not owned → 403
 *   10. Valid delete          → 204, 0 transactions remain, 1 audit_log row (action=delete)
 */

import * as schema from '@hud/db';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory DB setup (same DDL used by POST tests)
// ---------------------------------------------------------------------------
const sqlite = new Database(':memory:');
sqlite.pragma('foreign_keys = ON');
sqlite.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT 'hash',
    display_name TEXT,
    avatar_path TEXT,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'expense',
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
    source TEXT NOT NULL DEFAULT 'manual',
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const mockDb = drizzle(sqlite, { schema });

// ---------------------------------------------------------------------------
// Mock @/lib/db/index to use in-memory DB
// ---------------------------------------------------------------------------
vi.mock('@/lib/db/index', () => ({ db: mockDb }));

// ---------------------------------------------------------------------------
// CSRF cookie mock
// ---------------------------------------------------------------------------
const VALID_CSRF = 'test-csrf-token-valid-32chars';
let mockCsrfCookie: string | undefined = VALID_CSRF;

vi.mock('@/lib/auth/cookie', () => ({
  getCsrfCookieValue: vi.fn(async () => mockCsrfCookie),
}));

// ---------------------------------------------------------------------------
// requireSession mock
// ---------------------------------------------------------------------------
type SessionCtx = { userId: number; user: { id: number }; session: object };
let mockSessionCtx: SessionCtx | null = null;

vi.mock('@/lib/auth/index', () => ({
  requireSession: vi.fn(async (_mode?: string) => mockSessionCtx),
}));

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks are set
// ---------------------------------------------------------------------------
const { PUT, DELETE } = await import('../route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePutRequest(id: string, body: unknown, csrfHeader?: string): Request {
  return new Request(`http://localhost/api/transactions/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfHeader !== undefined ? { 'X-CSRF-Token': csrfHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string, csrfHeader?: string): Request {
  return new Request(`http://localhost/api/transactions/${id}`, {
    method: 'DELETE',
    headers: {
      ...(csrfHeader !== undefined ? { 'X-CSRF-Token': csrfHeader } : {}),
    },
  });
}

type RouteContext = { params: Promise<{ id: string }> };

function makeContext(id: string): RouteContext {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
function insertTransaction(userId: number, opts?: { amountMinor?: number; item?: string }): number {
  const result = sqlite
    .prepare(
      `INSERT INTO transactions (user_id, item, amount_minor, currency, occurred_at)
       VALUES (?, ?, ?, 'PHP', '2026-06-01T00:00:00+08:00')`,
    )
    .run(userId, opts?.item ?? 'Test Item', opts?.amountMinor ?? -10000);
  return result.lastInsertRowid as number;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(() => {
  // Insert two test users: user 1 (owner) and user 2 (other)
  mockDb.insert(schema.users).values({ email: 'owner@example.com', passwordHash: 'hash' }).run();
  mockDb.insert(schema.users).values({ email: 'other@example.com', passwordHash: 'hash' }).run();
});

beforeEach(() => {
  // Reset to valid state
  mockCsrfCookie = VALID_CSRF;
  mockSessionCtx = { userId: 1, user: { id: 1 }, session: {} };

  // Clean mutable tables
  sqlite.exec('DELETE FROM audit_log');
  sqlite.exec('DELETE FROM transactions');
  sqlite.exec('DELETE FROM categories');
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// PUT /api/transactions/[id]
// ===========================================================================
describe('PUT /api/transactions/[id]', () => {
  it('returns 401 when no session is present', async () => {
    mockSessionCtx = null;
    const txId = insertTransaction(1);

    const req = makePutRequest(String(txId), { item: 'Updated' }, VALID_CSRF);
    const res = await PUT(req, makeContext(String(txId)));

    expect(res.status).toBe(401);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const txId = insertTransaction(1);

    const req = makePutRequest(String(txId), { item: 'Updated' }, undefined);
    const res = await PUT(req, makeContext(String(txId)));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/csrf/i);
  });

  it('returns 403 when CSRF token is invalid', async () => {
    const txId = insertTransaction(1);

    const req = makePutRequest(String(txId), { item: 'Updated' }, 'wrong-token');
    const res = await PUT(req, makeContext(String(txId)));

    expect(res.status).toBe(403);
  });

  it('returns 403 when transaction belongs to a different user', async () => {
    // Insert transaction owned by user 2
    const txId = insertTransaction(2);

    // Authenticated as user 1
    const req = makePutRequest(String(txId), { item: 'Updated' }, VALID_CSRF);
    const res = await PUT(req, makeContext(String(txId)));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/forbidden/i);
  });

  it('returns 400 when amount is 0', async () => {
    const txId = insertTransaction(1);

    const req = makePutRequest(String(txId), { amount: 0 }, VALID_CSRF);
    const res = await PUT(req, makeContext(String(txId)));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.fieldErrors?.amount).toBeDefined();
  });

  it('returns 400 when no fields are provided', async () => {
    const txId = insertTransaction(1);

    const req = makePutRequest(String(txId), {}, VALID_CSRF);
    const res = await PUT(req, makeContext(String(txId)));

    expect(res.status).toBe(400);
  });

  it('updates item and writes one audit_log row (action=update)', async () => {
    const txId = insertTransaction(1, { item: 'Original Item', amountMinor: -28000 });

    const req = makePutRequest(String(txId), { item: 'Updated Item' }, VALID_CSRF);
    const res = await PUT(req, makeContext(String(txId)));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item).toBe('Updated Item');

    // DB check
    const txRow = sqlite.prepare('SELECT * FROM transactions WHERE id = ?').get(txId) as {
      item: string;
      amount_minor: number;
    };
    expect(txRow.item).toBe('Updated Item');
    expect(txRow.amount_minor).toBe(-28000); // unchanged

    // Audit check
    const auditRows = sqlite.prepare('SELECT * FROM audit_log').all() as {
      actor: string;
      action: string;
      entity: string;
      entity_id: string;
      payload_json: string;
    }[];
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].actor).toBe('user');
    expect(auditRows[0].action).toBe('update');
    expect(auditRows[0].entity).toBe('transaction');
    expect(auditRows[0].entity_id).toBe(String(txId));

    const payload = JSON.parse(auditRows[0].payload_json) as {
      before: { item: string };
      after: { item: string };
    };
    expect(payload.before.item).toBe('Original Item');
    expect(payload.after.item).toBe('Updated Item');
  });

  it('updates amount_minor via decimal conversion and writes diff-only audit', async () => {
    const txId = insertTransaction(1, { amountMinor: -28000 });

    const req = makePutRequest(String(txId), { amount: -350.5 }, VALID_CSRF);
    const res = await PUT(req, makeContext(String(txId)));

    expect(res.status).toBe(200);
    const json = await res.json();
    // Math.round(-350.5 * 100) = -35050
    expect(json.amountMinor).toBe(-35050);

    const auditRows = sqlite.prepare('SELECT * FROM audit_log').all() as {
      payload_json: string;
    }[];
    const payload = JSON.parse(auditRows[0].payload_json) as {
      before: { amountMinor: number };
      after: { amountMinor: number };
    };
    expect(payload.before.amountMinor).toBe(-28000);
    expect(payload.after.amountMinor).toBe(-35050);
  });
});

// ===========================================================================
// DELETE /api/transactions/[id]
// ===========================================================================
describe('DELETE /api/transactions/[id]', () => {
  it('returns 401 when no session is present', async () => {
    mockSessionCtx = null;
    const txId = insertTransaction(1);

    const req = makeDeleteRequest(String(txId), VALID_CSRF);
    const res = await DELETE(req, makeContext(String(txId)));

    expect(res.status).toBe(401);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const txId = insertTransaction(1);

    const req = makeDeleteRequest(String(txId), undefined);
    const res = await DELETE(req, makeContext(String(txId)));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/csrf/i);
  });

  it('returns 403 when transaction belongs to a different user', async () => {
    const txId = insertTransaction(2); // owned by user 2

    const req = makeDeleteRequest(String(txId), VALID_CSRF);
    const res = await DELETE(req, makeContext(String(txId)));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/forbidden/i);
  });

  it('deletes the transaction and writes one audit_log row (action=delete)', async () => {
    const txId = insertTransaction(1);

    const req = makeDeleteRequest(String(txId), VALID_CSRF);
    const res = await DELETE(req, makeContext(String(txId)));

    expect(res.status).toBe(204);

    // DB check — row must be gone
    const txRows = sqlite.prepare('SELECT * FROM transactions WHERE id = ?').all(txId);
    expect(txRows).toHaveLength(0);

    // Audit check
    const auditRows = sqlite.prepare('SELECT * FROM audit_log').all() as {
      actor: string;
      action: string;
      entity: string;
      entity_id: string;
    }[];
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].actor).toBe('user');
    expect(auditRows[0].action).toBe('delete');
    expect(auditRows[0].entity).toBe('transaction');
    expect(auditRows[0].entity_id).toBe(String(txId));
  });

  it('does not delete a transaction that belongs to another user (DB check)', async () => {
    const txId = insertTransaction(2); // owned by user 2

    const req = makeDeleteRequest(String(txId), VALID_CSRF);
    await DELETE(req, makeContext(String(txId)));

    // Transaction must still exist
    const txRows = sqlite.prepare('SELECT * FROM transactions WHERE id = ?').all(txId);
    expect(txRows).toHaveLength(1);

    // No audit row
    const auditRows = sqlite.prepare('SELECT * FROM audit_log').all();
    expect(auditRows).toHaveLength(0);
  });
});
