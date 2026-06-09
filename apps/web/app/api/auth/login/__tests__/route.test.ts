/**
 * app/api/auth/login/__tests__/route.test.ts
 *
 * API integration tests for POST /api/auth/login — Ticket 30.
 *
 * Ticket 30 root cause: the route used to validate `email`/`password` shape
 * with Zod (`email: z.string().email()`, `password: z.string().min(12)`)
 * BEFORE doing anything else, and any `safeParse` failure returned a bare
 * `{ error: 'Invalid credentials' }` (400) with no `remainingAttempts`, no
 * DB write, and no `audit_log` row — silently exempting short passwords,
 * empty fields, and malformed emails from the lockout/audit machinery.
 *
 * Per Kevin's explicit correction, the fix removes that gate entirely: every
 * (email, password) submission — however short, empty, or malformed — must
 * flow through the SAME constant-time wrong-credential path as a normal wrong
 * password: a real DB write (failed_attempts decrement for known accounts), a
 * real `audit_log` row (`login_fail`, `userId: null` for unknown accounts),
 * and a real, server-authoritative `remainingAttempts` in the response.
 *
 * These tests assert BOTH the response shape AND the underlying persisted
 * state (failed_attempts / audit_log rows) for every input-shape combination
 * named in the ticket's acceptance criteria, against both an existing and a
 * non-existent account.
 */

import * as schema from '@hud/db';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { NextRequest } from 'next/server';
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

vi.mock('@/lib/db/index', () => ({ db: mockDb }));

// ---------------------------------------------------------------------------
// Cookie helpers — require Next.js request scope; not exercised by any
// failure-path test (the only paths these tests assert on). Stubbed as no-ops.
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth/cookie', () => ({
  getSessionToken: vi.fn(async () => undefined),
  setSessionCookie: vi.fn(async () => undefined),
  setCsrfCookie: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Rate limiter — mocked to avoid cross-test IP-bucket interference and to
// keep these tests focused on the credential-recording behavior under test
// (rate limiting itself is covered elsewhere).
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth/rate-limit', () => ({
  checkLoginRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
  resetLoginRateLimit: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are set
// ---------------------------------------------------------------------------
const { POST } = await import('../route');
const { LOCKOUT_THRESHOLD } = await import('@/lib/auth/lockout-constants');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown, ip = '203.0.113.1'): NextRequest {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const EXISTING_EMAIL = 'kevin@example.com';
let existingUserId: number;
let ipCounter = 0;

/** Each test gets its own IP so the (mocked-but-shared) rate limiter / lockout
 * windows never bleed across cases. */
function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

function getUser(email: string) {
  return sqlite.prepare('SELECT * FROM users WHERE email = ?').get(email) as
    | {
        id: number;
        failed_attempts: number;
        locked_until: string | null;
      }
    | undefined;
}

function getAuditRows(): Array<{
  id: number;
  user_id: number | null;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  payload_json: string | null;
}> {
  return sqlite.prepare('SELECT * FROM audit_log ORDER BY id ASC').all() as never[];
}

beforeAll(() => {
  mockDb
    .insert(schema.users)
    .values({ email: EXISTING_EMAIL, passwordHash: 'hash', failedAttempts: 0 })
    .run();
  const row = getUser(EXISTING_EMAIL);
  if (!row) throw new Error('failed to seed test user');
  existingUserId = row.id;
});

beforeEach(() => {
  sqlite.exec('DELETE FROM audit_log');
  sqlite.exec(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ${existingUserId}`,
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Input-shape matrix — every combination named in the ticket's AC #6.
// Each entry is exercised against BOTH an existing and a non-existent email.
// ---------------------------------------------------------------------------
const malformedInputs: Array<{ name: string; password: string }> = [
  { name: 'sub-12-char wrong password', password: 'short1' },
  { name: '1-character password', password: 'x' },
  { name: 'empty password', password: '' },
];

describe('POST /api/auth/login — Ticket 30: every credential shape is a counted attempt', () => {
  describe.each([
    { label: 'existing account', email: EXISTING_EMAIL, isExisting: true },
    { label: 'non-existent account', email: 'nobody@example.com', isExisting: false },
  ])('against $label ($email)', ({ email, isExisting }) => {
    // For an EXISTING account, every recorded failure decrements the real
    // failed_attempts counter, so remainingAttempts = THRESHOLD - 1 after one
    // attempt. For a NON-EXISTENT account there is no row/counter to decrement
    // (this is the existing constant-time "no oracle" behavior, confirmed
    // correct by the ticket's scenario matrix) — the response reports the
    // fresh-state THRESHOLD, but the attempt is still independently recorded
    // via a real audit_log row (asserted below), satisfying AC #1's "this
    // applies whether or not the submitted email corresponds to an existing
    // account."
    const expectedRemaining = isExisting ? LOCKOUT_THRESHOLD - 1 : LOCKOUT_THRESHOLD;

    for (const { name, password } of malformedInputs) {
      it(`${name} + valid-format email → counted wrong-credential attempt with remainingAttempts`, async () => {
        const ip = nextIp();
        const res = await POST(makeRequest({ email, password }, ip));
        const json = (await res.json()) as {
          error?: string;
          remainingAttempts?: number;
          failedAttempts?: number;
        };

        expect(res.status).toBe(401);
        expect(json.error).toBe('Invalid credentials');
        expect(json.remainingAttempts).toBeTypeOf('number');
        expect(json.remainingAttempts).toBe(expectedRemaining);

        // Real persisted state changed — not a cosmetic response number
        const auditRows = getAuditRows();
        expect(auditRows).toHaveLength(1);
        expect(auditRows[0].action).toBe('login_fail');
        expect(auditRows[0].actor).toBe('anon');

        const payload = JSON.parse(auditRows[0].payload_json ?? '{}') as Record<string, unknown>;
        // Never log the attempted password or any hash — assert the payload's
        // key set is exactly the documented shape (no stray `password` field).
        expect(Object.keys(payload).sort()).not.toContain('password');
        expect(Object.keys(payload).sort()).not.toContain('password_hash');
        expect(payload.email_attempted).toBe(email);

        if (isExisting) {
          const user = getUser(EXISTING_EMAIL);
          expect(user?.failed_attempts).toBe(1);
          expect(auditRows[0].user_id).toBe(existingUserId);
          expect(payload.reason).toBe('wrong_password');
        } else {
          expect(auditRows[0].user_id).toBeNull();
          expect(payload.reason).toBe('no_such_account');
        }
      });
    }

    it(`invalid-format email (no "@") + any password → counted wrong-credential attempt`, async () => {
      const ip = nextIp();
      const badEmail = email.replace('@', '');
      const res = await POST(makeRequest({ email: badEmail, password: 'whatever-password' }, ip));
      const json = (await res.json()) as { error?: string; remainingAttempts?: number };

      expect(res.status).toBe(401);
      expect(json.error).toBe('Invalid credentials');
      // A malformed email never matches a real account row — regardless of
      // which fixture email we mangled, this always lands on the
      // "no such account" branch (fresh-state remaining count, no oracle).
      expect(json.remainingAttempts).toBe(LOCKOUT_THRESHOLD);

      const auditRows = getAuditRows();
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].action).toBe('login_fail');
      expect(auditRows[0].user_id).toBeNull();
      const payload = JSON.parse(auditRows[0].payload_json ?? '{}');
      expect(payload.email_attempted).toBe(badEmail.trim().toLowerCase());
      expect(payload.reason).toBe('no_such_account');
    });
  });

  it('empty email + empty password ("accidental click of Authenticate") → counted wrong-credential attempt', async () => {
    const ip = nextIp();
    const res = await POST(makeRequest({ email: '', password: '' }, ip));
    const json = (await res.json()) as { error?: string; remainingAttempts?: number };

    expect(res.status).toBe(401);
    expect(json.error).toBe('Invalid credentials');
    expect(json.remainingAttempts).toBeTypeOf('number');
    // Empty email never matches a real account → "no such account" branch
    expect(json.remainingAttempts).toBe(LOCKOUT_THRESHOLD);

    const auditRows = getAuditRows();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe('login_fail');
    expect(auditRows[0].user_id).toBeNull();
    const payload = JSON.parse(auditRows[0].payload_json ?? '{}');
    expect(payload.email_attempted).toBe('');
    expect(payload.reason).toBe('no_such_account');
  });

  it('non-string / wrong-typed email and password fields are coerced, not schema-rejected', async () => {
    const ip = nextIp();
    // Deliberately sending wrong-typed fields (number / null) to prove the
    // route coerces rather than schema-rejecting with a bare 400.
    const res = await POST(makeRequest({ email: 12345, password: null }, ip));
    const json = (await res.json()) as { error?: string; remainingAttempts?: number };

    expect(res.status).toBe(401);
    expect(json.error).toBe('Invalid credentials');
    expect(json.remainingAttempts).toBe(LOCKOUT_THRESHOLD);

    const auditRows = getAuditRows();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe('login_fail');
  });

  it(`${LOCKOUT_THRESHOLD} consecutive malformed/short submissions trip lockout at the same threshold as normal wrong passwords`, async () => {
    const ip = nextIp();
    let last: { remainingAttempts?: number; lockedUntil?: string } = {};

    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      const res = await POST(makeRequest({ email: EXISTING_EMAIL, password: `x${i}` }, ip));
      last = (await res.json()) as { remainingAttempts?: number; lockedUntil?: string };
      expect(res.status).toBe(401);
    }

    // Final attempt should report 0 remaining and a lockedUntil timestamp
    expect(last.remainingAttempts).toBe(0);
    expect(last.lockedUntil).toBeTypeOf('string');

    const user = getUser(EXISTING_EMAIL);
    expect(user?.failed_attempts).toBe(LOCKOUT_THRESHOLD);
    expect(user?.locked_until).toBeTypeOf('string');

    const auditRows = getAuditRows();
    // One login_fail per attempt + one lockout row on the threshold-tripping attempt
    expect(auditRows.filter((r) => r.action === 'login_fail')).toHaveLength(LOCKOUT_THRESHOLD);
    expect(auditRows.filter((r) => r.action === 'lockout')).toHaveLength(1);

    // A subsequent attempt while locked is rejected without further increment
    const lockedRes = await POST(makeRequest({ email: EXISTING_EMAIL, password: 'short' }, ip));
    const lockedJson = (await lockedRes.json()) as { remainingAttempts?: number };
    expect(lockedRes.status).toBe(401);
    expect(lockedJson.remainingAttempts).toBe(0);
    const userAfter = getUser(EXISTING_EMAIL);
    expect(userAfter?.failed_attempts).toBe(LOCKOUT_THRESHOLD); // not incremented further
  });

  it('a normal ≥12-char wrong-password submission against an existing account behaves identically to before (regression guard)', async () => {
    const ip = nextIp();
    const res = await POST(
      makeRequest({ email: EXISTING_EMAIL, password: 'this-is-a-long-wrong-password' }, ip),
    );
    const json = (await res.json()) as {
      error?: string;
      remainingAttempts?: number;
      failedAttempts?: number;
    };

    expect(res.status).toBe(401);
    expect(json.error).toBe('Invalid credentials');
    expect(json.remainingAttempts).toBe(LOCKOUT_THRESHOLD - 1);
    expect(json.failedAttempts).toBe(1);

    const user = getUser(EXISTING_EMAIL);
    expect(user?.failed_attempts).toBe(1);

    const auditRows = getAuditRows();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe('login_fail');
    expect(auditRows[0].user_id).toBe(existingUserId);
    const payload = JSON.parse(auditRows[0].payload_json ?? '{}');
    expect(payload.reason).toBe('wrong_password');
  });

  it('every 401 wrong-credential response includes remainingAttempts (no bare { error } bodies)', async () => {
    const cases: Array<{ email: unknown; password: unknown }> = [
      { email: EXISTING_EMAIL, password: 'short' },
      { email: EXISTING_EMAIL, password: '' },
      { email: 'nobody@example.com', password: 'short' },
      { email: 'not-an-email', password: 'short' },
      { email: '', password: '' },
      { email: EXISTING_EMAIL, password: 'this-is-a-long-wrong-password-12345' },
    ];

    for (const body of cases) {
      const ip = nextIp();
      const res = await POST(makeRequest(body, ip));
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error?: string; remainingAttempts?: number };
      expect(json.error).toBe('Invalid credentials');
      expect(json.remainingAttempts).toBeTypeOf('number');
    }
  });
});
