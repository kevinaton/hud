/**
 * Integration tests for auth guards.
 *
 * Tests:
 *  - requireSession redirects to /login without a session cookie
 *  - requireSession redirects with an expired session
 *  - requireSession returns context with a valid session
 *  - requireSession(mode:'response') returns null instead of redirecting
 */

import * as schema from '@hud/db';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Set up in-memory DB
const sqlite = new Database(':memory:');
sqlite.pragma('foreign_keys = ON');
sqlite.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT 'hash',
    display_name TEXT,
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

// Track redirect calls
const redirectMock = vi.fn((url: string): never => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

// Track cookie reads
let mockSessionToken: string | undefined = undefined;

vi.mock('@/lib/auth/cookie', async (importOriginal) => {
  const original = await importOriginal<typeof import('../cookie')>();
  return {
    ...original,
    getSessionToken: vi.fn(async () => mockSessionToken),
  };
});

const { requireSession } = await import('../index');
const { createSession } = await import('../session');

let userCounter = 0;

function createTestUser(): number {
  userCounter += 1;
  const user = mockDb
    .insert(schema.users)
    .values({ email: `guard-test${userCounter}@example.com`, passwordHash: 'hash' })
    .returning()
    .get();
  if (!user) throw new Error('Failed to create user');
  return user.id;
}

beforeEach(() => {
  mockSessionToken = undefined;
  redirectMock.mockClear();
  sqlite.exec('DELETE FROM sessions');
  sqlite.exec('DELETE FROM users');
});

describe('requireSession (redirect mode)', () => {
  it('redirects to /login when no cookie is present', async () => {
    mockSessionToken = undefined;
    await expect(requireSession()).rejects.toThrow('REDIRECT:/login');
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('redirects to /login for an expired session', async () => {
    const userId = createTestUser();
    const { plainToken, session } = mockDb.transaction((tx) => createSession(tx, userId));

    // Expire the session
    mockDb
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(schema.sessions.id, session.id))
      .run();

    mockSessionToken = plainToken;

    await expect(requireSession()).rejects.toThrow('REDIRECT:/login');
  });

  it('returns session context for a valid session', async () => {
    const userId = createTestUser();
    const { plainToken } = mockDb.transaction((tx) => createSession(tx, userId));

    mockSessionToken = plainToken;

    const ctx = await requireSession();
    expect(ctx.userId).toBe(userId);
    expect(ctx.user.id).toBe(userId);
    expect(ctx.session).toBeDefined();
  });
});

describe('requireSession (response mode)', () => {
  it('returns null when no cookie is present', async () => {
    mockSessionToken = undefined;
    const ctx = await requireSession('response');
    expect(ctx).toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('returns null for an expired session', async () => {
    const userId = createTestUser();
    const { plainToken, session } = mockDb.transaction((tx) => createSession(tx, userId));

    mockDb
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(schema.sessions.id, session.id))
      .run();

    mockSessionToken = plainToken;

    const ctx = await requireSession('response');
    expect(ctx).toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('returns session context for a valid session', async () => {
    const userId = createTestUser();
    const { plainToken } = mockDb.transaction((tx) => createSession(tx, userId));

    mockSessionToken = plainToken;

    const ctx = await requireSession('response');
    expect(ctx).not.toBeNull();
    expect(ctx?.userId).toBe(userId);
  });
});
