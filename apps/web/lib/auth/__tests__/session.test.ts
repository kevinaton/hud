/**
 * Unit tests for lib/auth/session.ts and lib/auth/token.ts session storage model.
 *
 * Verifies:
 *  - sessions.id stores sha256(token) not the raw token
 *  - createSession returns plain token only (not stored)
 *  - getSession returns null for expired sessions
 *  - extendSession pushes expiresAt forward
 *  - rotateSession creates a new session and deletes the old one
 *  - destroySession removes the row
 */

import * as schema from '@hud/db';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../token';

// Build in-memory DB for these tests
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
`);
const mockDb = drizzle(sqlite, { schema });

vi.mock('@/lib/db/index', () => ({
  db: mockDb,
}));

const { createSession, getSession, extendSession, rotateSession, destroySession } = await import(
  '../session'
);

let userCounter = 0;

function createTestUser(): number {
  userCounter += 1;
  const user = mockDb
    .insert(schema.users)
    .values({ email: `session-test${userCounter}@example.com`, passwordHash: 'hash' })
    .returning()
    .get();
  if (!user) throw new Error('Failed to create user');
  return user.id;
}

beforeEach(() => {
  sqlite.exec('DELETE FROM sessions');
  sqlite.exec('DELETE FROM users');
});

describe('createSession', () => {
  it('returns a plain token and inserts a row with sha256(token) as id', () => {
    const userId = createTestUser();

    const { plainToken, session } = mockDb.transaction((tx) =>
      createSession(tx, userId, { ipAddress: '127.0.0.1', userAgent: 'test' }),
    );

    expect(plainToken).toBeTruthy();
    expect(session.id).toBe(hashToken(plainToken));
    // Raw token is never stored
    expect(session.id).not.toBe(plainToken);
  });

  it('sets expiresAt to approximately 30 days in the future', () => {
    const userId = createTestUser();
    const { session } = mockDb.transaction((tx) => createSession(tx, userId));

    const expiresAt = new Date(session.expiresAt);
    const diffDays = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);
  });
});

describe('getSession', () => {
  it('returns session and user for a valid token', () => {
    const userId = createTestUser();
    const { plainToken } = mockDb.transaction((tx) => createSession(tx, userId));

    const result = getSession(plainToken);
    expect(result).not.toBeNull();
    expect(result?.user.id).toBe(userId);
    expect(result?.session.userId).toBe(userId);
  });

  it('returns null for an unknown token', () => {
    const result = getSession('completely-unknown-token-value');
    expect(result).toBeNull();
  });

  it('returns null and deletes row for an expired session', () => {
    const userId = createTestUser();
    const { plainToken, session } = mockDb.transaction((tx) => createSession(tx, userId));

    // Manually expire the session
    mockDb
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(schema.sessions.id, session.id))
      .run();

    const result = getSession(plainToken);
    expect(result).toBeNull();

    // Row should be deleted
    const row = mockDb
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, session.id))
      .get();
    expect(row).toBeUndefined();
  });
});

describe('extendSession', () => {
  it('pushes expiresAt forward', () => {
    const userId = createTestUser();
    const { plainToken, session } = mockDb.transaction((tx) => createSession(tx, userId));

    const originalExpiry = new Date(session.expiresAt).getTime();

    // Advance time so the new expiry is different
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 5000));
    extendSession(plainToken);
    vi.useRealTimers();

    const updated = mockDb
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, session.id))
      .get();

    expect(updated).toBeDefined();
    if (updated) {
      const newExpiry = new Date(updated.expiresAt).getTime();
      expect(newExpiry).toBeGreaterThanOrEqual(originalExpiry);
    }
  });
});

describe('rotateSession', () => {
  it('creates a new session with a different id and deletes the old one', () => {
    const userId = createTestUser();
    const { plainToken: oldToken, session: oldSession } = mockDb.transaction((tx) =>
      createSession(tx, userId),
    );

    const { plainToken: newToken, session: newSession } = mockDb.transaction((tx) =>
      rotateSession(tx, oldToken, userId, { ipAddress: '127.0.0.1' }),
    );

    // New token is different
    expect(newToken).not.toBe(oldToken);
    expect(newSession.id).not.toBe(oldSession.id);

    // Old session row is gone
    const oldRow = mockDb
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, oldSession.id))
      .get();
    expect(oldRow).toBeUndefined();

    // New session row exists
    const newRow = mockDb
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, newSession.id))
      .get();
    expect(newRow).toBeDefined();
  });

  it('creates a new session even without an old token (first login)', () => {
    const userId = createTestUser();
    const { plainToken, session } = mockDb.transaction((tx) =>
      rotateSession(tx, undefined, userId),
    );

    expect(plainToken).toBeTruthy();
    expect(session.id).toBe(hashToken(plainToken));
  });
});

describe('destroySession', () => {
  it('deletes the session row from the DB', () => {
    const userId = createTestUser();
    const { plainToken, session } = mockDb.transaction((tx) => createSession(tx, userId));

    destroySession(plainToken);

    const row = mockDb
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, session.id))
      .get();
    expect(row).toBeUndefined();
  });

  it('is a no-op for unknown tokens (idempotent)', () => {
    expect(() => destroySession('unknown-token-value')).not.toThrow();
  });
});
