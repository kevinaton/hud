/**
 * Unit tests for lib/auth/lockout.ts
 *
 * Uses an in-memory SQLite database to avoid touching the real DB file.
 */

import * as schema from '@hud/db';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

// Create in-memory DB for lockout tests
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
`);
const mockDb = drizzle(sqlite, { schema });

vi.mock('@/lib/db/index', () => ({
  db: mockDb,
}));

const {
  checkLockout,
  clearLockout,
  recordFailedAttempt,
  LOCKOUT_THRESHOLD,
  LOCKOUT_DURATION_MINUTES,
} = await import('./lockout');

let userCounter = 0;

function createTestUser(): number {
  userCounter += 1;
  const user = mockDb
    .insert(schema.users)
    .values({ email: `test${userCounter}@example.com`, passwordHash: 'hash' })
    .returning()
    .get();
  if (!user) throw new Error('Failed to create test user');
  return user.id;
}

// Helper: run an action inside a transaction (required by recordFailedAttempt/clearLockout)
function withTx<T>(fn: (tx: Parameters<Parameters<typeof mockDb.transaction>[0]>[0]) => T): T {
  return mockDb.transaction((tx) => fn(tx));
}

beforeEach(() => {
  sqlite.exec('DELETE FROM users');
});

describe('checkLockout', () => {
  it('returns { locked: false } for a new user with no lockout', () => {
    const userId = createTestUser();
    const result = checkLockout(userId);
    expect(result.locked).toBe(false);
  });

  it('returns { locked: false } for a user with past locked_until', () => {
    const userId = createTestUser();
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    sqlite.exec(`UPDATE users SET locked_until = '${pastDate}' WHERE id = ${userId}`);
    const result = checkLockout(userId);
    expect(result.locked).toBe(false);
  });

  it('returns { locked: true, lockedUntil } when locked_until is in the future', () => {
    const userId = createTestUser();
    const futureDate = new Date(Date.now() + 15 * 60_000).toISOString();
    sqlite.exec(
      `UPDATE users SET locked_until = '${futureDate}', failed_attempts = 5 WHERE id = ${userId}`,
    );
    const result = checkLockout(userId);
    expect(result.locked).toBe(true);
    if (result.locked) {
      expect(result.lockedUntil).toBeInstanceOf(Date);
      expect(result.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    }
  });
});

describe('recordFailedAttempt', () => {
  it('increments failed_attempts from 0 to 1', () => {
    const userId = createTestUser();
    const count = withTx((tx) => recordFailedAttempt(tx, userId));
    expect(count).toBe(1);
  });

  it('accumulates failed_attempts correctly', () => {
    const userId = createTestUser();
    expect(withTx((tx) => recordFailedAttempt(tx, userId))).toBe(1);
    expect(withTx((tx) => recordFailedAttempt(tx, userId))).toBe(2);
    expect(withTx((tx) => recordFailedAttempt(tx, userId))).toBe(3);
  });

  it(`sets locked_until when threshold (${LOCKOUT_THRESHOLD}) is reached`, () => {
    const userId = createTestUser();
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      withTx((tx) => recordFailedAttempt(tx, userId));
    }
    // Not yet locked
    const beforeLock = checkLockout(userId);
    expect(beforeLock.locked).toBe(false);

    // 5th attempt triggers lockout
    const count = withTx((tx) => recordFailedAttempt(tx, userId));
    expect(count).toBe(LOCKOUT_THRESHOLD);

    const afterLock = checkLockout(userId);
    expect(afterLock.locked).toBe(true);
    if (afterLock.locked) {
      const lockDurationMs = afterLock.lockedUntil.getTime() - Date.now();
      const expectedMs = LOCKOUT_DURATION_MINUTES * 60 * 1000;
      expect(lockDurationMs).toBeGreaterThan(expectedMs - 5000);
      expect(lockDurationMs).toBeLessThanOrEqual(expectedMs + 5000);
    }
  });
});

describe('clearLockout', () => {
  it('resets failed_attempts to 0 and clears locked_until', () => {
    const userId = createTestUser();

    // Lock the account
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      withTx((tx) => recordFailedAttempt(tx, userId));
    }
    expect(checkLockout(userId).locked).toBe(true);

    withTx((tx) => clearLockout(tx, userId));

    expect(checkLockout(userId).locked).toBe(false);

    const row = sqlite
      .prepare('SELECT failed_attempts, locked_until FROM users WHERE id = ?')
      .get(userId) as { failed_attempts: number; locked_until: string | null } | undefined;
    expect(row?.failed_attempts).toBe(0);
    expect(row?.locked_until).toBeNull();
  });
});

describe('lockout threshold constants', () => {
  it('LOCKOUT_THRESHOLD is 5', () => {
    expect(LOCKOUT_THRESHOLD).toBe(5);
  });

  it('LOCKOUT_DURATION_MINUTES is 15', () => {
    expect(LOCKOUT_DURATION_MINUTES).toBe(15);
  });
});
