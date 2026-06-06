/**
 * app/api/transactions/__tests__/route.test.ts
 *
 * API integration tests for POST /api/transactions.
 *
 * Test cases (per Ticket 05 AC):
 *   1. POST without session cookie → 401
 *   2. POST with invalid CSRF token → 403
 *   3. POST with amount=0 → 400
 *   4. POST with valid payload → inserts exactly 1 transaction + 1 audit_log row (atomic)
 *   5. POST same payload twice → 2 separate transaction rows (no dedup)
 */

import * as schema from '@hud/db';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory DB setup
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
// Import route handler AFTER mocks are set
// ---------------------------------------------------------------------------
const { POST } = await import('../route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown, csrfHeader?: string): Request {
  return new Request('http://localhost/api/transactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfHeader !== undefined ? { 'X-CSRF-Token': csrfHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  item: 'Grocery',
  amount: -280,
  date: '2026-06-05',
  categoryName: 'Food',
  notes: null,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(() => {
  // Insert a test user
  mockDb.insert(schema.users).values({ email: 'test@example.com', passwordHash: 'hash' }).run();
});

beforeEach(() => {
  // Reset to valid state before each test
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/transactions', () => {
  it('returns 401 when no session is present', async () => {
    mockSessionCtx = null;

    const req = makeRequest(validBody, VALID_CSRF);
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const req = makeRequest(validBody, undefined);
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/csrf/i);
  });

  it('returns 403 when CSRF token is invalid', async () => {
    const req = makeRequest(validBody, 'wrong-token');
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/csrf/i);
  });

  it('returns 400 when amount is 0', async () => {
    const req = makeRequest({ ...validBody, amount: 0 }, VALID_CSRF);
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/validation/i);
    expect(json.fieldErrors?.amount).toBeDefined();
  });

  it('returns 400 when item is missing', async () => {
    const req = makeRequest({ ...validBody, item: '' }, VALID_CSRF);
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.fieldErrors?.item).toBeDefined();
  });

  it('inserts exactly 1 transaction row and 1 audit_log row on valid request', async () => {
    const req = makeRequest(validBody, VALID_CSRF);
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBeTypeOf('number');
    expect(json.amountMinor).toBe(-28000); // Math.round(-280 * 100)

    // Verify DB state
    const txRows = sqlite.prepare('SELECT * FROM transactions').all();
    expect(txRows).toHaveLength(1);

    const auditRows = sqlite.prepare('SELECT * FROM audit_log').all();
    expect(auditRows).toHaveLength(1);

    const auditRow = auditRows[0] as {
      actor: string;
      action: string;
      entity: string;
      entity_id: string;
      payload_json: string;
    };
    expect(auditRow.actor).toBe('user');
    expect(auditRow.action).toBe('create');
    expect(auditRow.entity).toBe('transaction');
    expect(auditRow.entity_id).toBe(String(json.id));

    const payload = JSON.parse(auditRow.payload_json) as { amountMinor: number };
    expect(payload.amountMinor).toBe(-28000);
  });

  it('inserts 2 separate transaction rows when the same payload is posted twice (no dedup)', async () => {
    const req1 = makeRequest(validBody, VALID_CSRF);
    const res1 = await POST(req1);
    expect(res1.status).toBe(201);

    const req2 = makeRequest(validBody, VALID_CSRF);
    const res2 = await POST(req2);
    expect(res2.status).toBe(201);

    const txRows = sqlite.prepare('SELECT * FROM transactions').all();
    expect(txRows).toHaveLength(2);

    const auditRows = sqlite.prepare('SELECT * FROM audit_log').all();
    expect(auditRows).toHaveLength(2);
  });

  it('stores amountMinor as integer (Math.round(amount * 100))', async () => {
    const req = makeRequest({ ...validBody, amount: 280.505 }, VALID_CSRF);
    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    // Math.round(280.505 * 100) = Math.round(28050.5) = 28051
    expect(json.amountMinor).toBe(28051);
    expect(Number.isInteger(json.amountMinor)).toBe(true);
  });

  it('auto-creates category with kind=expense when a new name is given', async () => {
    const req = makeRequest({ ...validBody, categoryName: 'New Category' }, VALID_CSRF);
    const res = await POST(req);
    expect(res.status).toBe(201);

    const cats = sqlite.prepare("SELECT * FROM categories WHERE name = 'New Category'").all() as {
      kind: string;
    }[];
    expect(cats).toHaveLength(1);
    expect(cats[0].kind).toBe('expense');
  });

  it('strips emoji from category name before inserting', async () => {
    const req = makeRequest({ ...validBody, categoryName: 'Food' }, VALID_CSRF);
    const res = await POST(req);
    expect(res.status).toBe(201);

    // Category stored without emoji
    const cats = sqlite.prepare("SELECT * FROM categories WHERE name = 'Food'").all();
    expect(cats).toHaveLength(1);
  });
});
