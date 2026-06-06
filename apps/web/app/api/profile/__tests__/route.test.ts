/**
 * app/api/profile/__tests__/route.test.ts
 *
 * API integration tests for GET /api/profile and PUT /api/profile.
 *
 * Test cases:
 *   GET:
 *     1. No session → 401
 *     2. Valid session → 200 with user fields
 *   PUT:
 *     3. No session → 401
 *     4. CSRF missing → 403
 *     5. Invalid CSRF → 403
 *     6. Empty body (no fields) → 400
 *     7. Invalid email → 400
 *     8. Valid displayName update → 200, DB updated, audit_log written
 *     9. Valid email update → 200, DB updated, audit_log written
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

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks are set
// ---------------------------------------------------------------------------
const { GET, PUT } = await import('../route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeGetRequest(): Request {
  return new Request('http://localhost/api/profile', {
    method: 'GET',
  });
}

function makePutRequest(body: unknown, csrfHeader?: string): Request {
  return new Request('http://localhost/api/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfHeader !== undefined ? { 'X-CSRF-Token': csrfHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
let userId: number;

beforeAll(() => {
  const result = mockDb
    .insert(schema.users)
    .values({ email: 'profile-test@example.com', passwordHash: 'hash', displayName: 'Test User' })
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
      email: 'profile-test@example.com',
      displayName: 'Test User',
      avatarPath: null,
      passwordHash: 'hash',
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
// Tests — GET
// ---------------------------------------------------------------------------
describe('GET /api/profile', () => {
  it('returns 401 when no session is present', async () => {
    mockSessionCtx = null;

    const req = makeGetRequest();
    const res = await GET(req as Parameters<typeof GET>[0]);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 200 with user fields when session is valid', async () => {
    const req = makeGetRequest();
    const res = await GET(req as Parameters<typeof GET>[0]);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(userId);
    expect(json.email).toBe('profile-test@example.com');
    expect(json.displayName).toBe('Test User');
    expect(json.avatarPath).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — PUT
// ---------------------------------------------------------------------------
describe('PUT /api/profile', () => {
  it('returns 401 when no session is present', async () => {
    mockSessionCtx = null;

    const req = makePutRequest({ displayName: 'New Name' }, VALID_CSRF);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const req = makePutRequest({ displayName: 'New Name' }, undefined);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/csrf/i);
  });

  it('returns 403 when CSRF token is invalid', async () => {
    const req = makePutRequest({ displayName: 'New Name' }, 'wrong-token');
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/csrf/i);
  });

  it('returns 400 when no fields are provided', async () => {
    const req = makePutRequest({}, VALID_CSRF);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no fields/i);
  });

  it('returns 400 when email is invalid', async () => {
    const req = makePutRequest({ email: 'not-an-email' }, VALID_CSRF);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/validation/i);
    expect(json.issues?.email).toBeDefined();
  });

  it('updates displayName and writes one audit_log row on success', async () => {
    const req = makePutRequest({ displayName: 'Updated Name' }, VALID_CSRF);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.displayName).toBe('Updated Name');

    // DB check — audit_log
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
    expect(auditRows[0].entity_id).toBe(String(userId));

    const payload = JSON.parse(auditRows[0].payload_json) as {
      before: { displayName: string };
      after: { displayName: string };
    };
    expect(payload.after.displayName).toBe('Updated Name');
  });

  it('updates email and writes one audit_log row on success', async () => {
    const req = makePutRequest({ email: 'newemail@example.com' }, VALID_CSRF);
    const res = await PUT(req as Parameters<typeof PUT>[0]);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.email).toBe('newemail@example.com');

    const auditRows = sqlite.prepare('SELECT * FROM audit_log').all();
    expect(auditRows).toHaveLength(1);
  });
});
