/**
 * lib/db/sessions.ts
 *
 * Query helpers for the sessions table.
 * Note: most session lifecycle logic lives in lib/auth/session.ts.
 * These helpers are for direct DB access (e.g. admin cleanup).
 */

import { sessions } from '@hud/db';
import type { Session } from '@hud/db';
import { eq, lt } from 'drizzle-orm';
import { db } from './index';

/**
 * Get a session by its token hash (sessions.id).
 */
export function getSessionByHash(tokenHash: string): Session | undefined {
  return db.select().from(sessions).where(eq(sessions.id, tokenHash)).get();
}

/**
 * Delete all expired sessions for cleanup.
 * Safe to call periodically (e.g. from a cron or on startup).
 */
export function deleteExpiredSessions(): number {
  const now = new Date().toISOString();
  const result = db.delete(sessions).where(lt(sessions.expiresAt, now)).run();

  return result.changes;
}

/**
 * Delete all sessions for a given user (force logout all devices).
 */
export function deleteAllSessionsForUser(userId: number): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}
