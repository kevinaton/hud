/**
 * app/api/profile/__tests__/password.test.ts
 *
 * API integration tests for PUT /api/profile/password.
 *
 * Test cases:
 *   1. No session → 401
 *   2. CSRF missing → 403
 *   3. Invalid CSRF → 403
 *   4. Passwords don't match → 400
 *   5. New password too short → 400
 *   6. Wrong current password → 400
 *   7. Valid change → 200, audit_log written with field='password' (no hash)
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
// Mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/db/index', () => ({ db: mockDb }));

const VALID_CSRF = 'test-csrf-token-valid-32chars';
let mockCsrfCookie: string | undefined = VALID_CSRF;

vi.mock('@/lib/auth/cookie', () => ({
  getCsrfCookieValue: vi.fn(async () => mockCsrfCookie),
}));

interface MockUser {
  id: number;
  email: string;
  displayName: string | null;
  avatarPath: string | null;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}
type SessionCtx = { userId: number; user: MockUser; session: object };
let mockSessionCtx: SessionCtx | null = null;

vi.mock('@/lib/auth/index', () => ({
  requireSession: vi.fn(async (_mode?: string) => mockSessionCtx),
}));

// We mock password hashing/verification for test speed — argon2 is too slow for unit tests.
// The password module is tested separately in lib/auth/__tests__/
const CURRENT_PW_PLAIN = 'correctpassword123';
const FAKE_HASH = 'argon2id_fake_hash_for_testing';

vi.mock('@/lib/auth/password', () => ({
  hashPassword: vi.fn(async (plain: string) => `hash(${plain})`),
  verifyPassword: vi.fn(async (plain: string, encoded: string) => {
    // Simulate: verifyPassword(CURRENT_PW_PLAIN, FAKE_HASH) → true
    return plain === CURRENT_PW_PLAIN && encoded === FAKE_HASH;
  }),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks
// ---------------------------------------------------------------------------
const { PUT } = await import('../password/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePutRequest(body: unknown, csrfHeader?: string): Request {
  return new Request('http://localhost/api/profile/password', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfHeader !== undefined ? { 'X-CSRF-Token': csrfHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  currentPassword: CURRENT_PW_PLAIN,
  newPassword: 'newsecurepassword',
  confirmPassword: 'newsecurepassword',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
let userId: number;

beforeAll(() => {
  const result = mockDb
    .insert(schema.users)
    .values({ email: 'pw-test@example.com', passwordHash: FAKE_HASH })
    .returning()
    .get();

  if (!result) throw new Error('Failed to insert test user');
  userId = result.id;
});

beforeEach(() => {
  mockCsrfCookie = VALID_CSRF;
  mockSessionCtx = {
    userId,
    user: {
      id: userId,
      email: 'pw-test@example.com',
      displayName: null,
      avatarPath: null,
      passwordHash: FAKE_HASH,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    session: {},
  };

  sqlite.exec('DELETE FROM audit_log');
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PUT /api/profile/password', () => {
  it('returns 401 when no session is present', async () => {
    mockSessionCtx = null;

    const req = makePutRequest(validBody, VALID_CSRF);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const req = makePutRequest(validBody, undefined);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/csrf/i);
  });

  it('returns 403 when CSRF token is invalid', async () => {
    const req = makePutRequest(validBody, 'wrong-token');
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/csrf/i);
  });

  it('returns 400 when passwords do not match', async () => {
    const req = makePutRequest({ ...validBody, confirmPassword: 'different-password' }, VALID_CSRF);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/validation/i);
    expect(json.issues?.confirmPassword).toBeDefined();
  });

  it('returns 400 when new password is too short', async () => {
    const req = makePutRequest(
      { ...validBody, newPassword: 'short', confirmPassword: 'short' },
      VALID_CSRF,
    );
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/validation/i);
    expect(json.issues?.newPassword).toBeDefined();
  });

  it('returns 400 when current password is wrong', async () => {
    const req = makePutRequest({ ...validBody, currentPassword: 'wrongpassword' }, VALID_CSRF);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/current password is incorrect/i);
  });

  it('returns 200 and writes one audit_log row with field=password on success', async () => {
    const req = makePutRequest(validBody, VALID_CSRF);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // DB audit check
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
    expect(auditRows[0].entity).toBe('user');

    const payload = JSON.parse(auditRows[0].payload_json) as { field: string };
    expect(payload.field).toBe('password');

    // Critically: no hash or plain password in payload
    const payloadStr = auditRows[0].payload_json;
    expect(payloadStr).not.toContain(FAKE_HASH);
    expect(payloadStr).not.toContain(CURRENT_PW_PLAIN);
    expect(payloadStr).not.toContain(validBody.newPassword);
  });
});
