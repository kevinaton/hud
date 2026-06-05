/**
 * lib/auth/session.ts
 *
 * Session lifecycle: create, get, rotate, destroy, sliding TTL refresh.
 *
 * Storage model:
 *   - Cookie value = opaque 256-bit base64url token (plain)
 *   - DB stores sha256(token) as sessions.id — raw token never persisted
 *
 * Session rotation on login (session fixation defense):
 *   - Old session (if any) is deleted
 *   - New row inserted with new token hash
 */

import { db } from '@/lib/db/index';
import type { DrizzleTx } from '@/lib/db/index';
import { sessions, users } from '@hud/db';
import type { Session, User } from '@hud/db';
import { eq } from 'drizzle-orm';
import { generateToken, hashToken } from './token';

const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);

function expiresAt(days = TTL_DAYS): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export interface SessionMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionContext {
  userId: number;
  user: User;
  session: Session;
  /** The plain token — returned only from createSession so caller can set the cookie */
  plainToken?: string;
}

/**
 * Create a new session for a user.
 * Must be called inside a Drizzle transaction when combined with audit log writes.
 * Returns the plain token (to set as cookie value) and the session row.
 */
export function createSession(
  tx: DrizzleTx,
  userId: number,
  meta: SessionMeta = {},
): { plainToken: string; session: Session } {
  const { plain, hash } = generateToken();

  const session = tx
    .insert(sessions)
    .values({
      id: hash,
      userId,
      expiresAt: expiresAt(),
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    })
    .returning()
    .get();

  if (!session) throw new Error('Failed to create session');

  return { plainToken: plain, session };
}

/**
 * Look up a session by the plain cookie token.
 * Returns the session row if found and not expired, null otherwise.
 * Also returns the user associated with the session.
 */
export function getSession(cookieToken: string): { session: Session; user: User } | null {
  const tokenHash = hashToken(cookieToken);

  const session = db.select().from(sessions).where(eq(sessions.id, tokenHash)).get();

  if (!session) return null;

  if (new Date(session.expiresAt) <= new Date()) {
    // Expired — delete it
    db.delete(sessions).where(eq(sessions.id, tokenHash)).run();
    return null;
  }

  const user = db.select().from(users).where(eq(users.id, session.userId)).get();

  if (!user) return null;

  return { session, user };
}

/**
 * Extend the session TTL (sliding window).
 * Only writes to the DB when the session will expire within 7 days —
 * eliminates the per-request write on the vast majority of requests
 * while keeping the sliding window semantics intact.
 */
export function extendSession(cookieToken: string): void {
  const tokenHash = hashToken(cookieToken);

  const session = db.select().from(sessions).where(eq(sessions.id, tokenHash)).get();
  if (!session) return;

  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  if (new Date(session.expiresAt) > sevenDaysFromNow) {
    // More than 7 days remaining — skip the write
    return;
  }

  db.update(sessions).set({ expiresAt: expiresAt() }).where(eq(sessions.id, tokenHash)).run();
}

/**
 * Rotate the session (session fixation defense).
 * Deletes the old session by hash and creates a new one.
 * Must be called inside a Drizzle transaction.
 *
 * Returns the new plain token.
 */
export function rotateSession(
  tx: DrizzleTx,
  oldCookieToken: string | undefined,
  userId: number,
  meta: SessionMeta = {},
): { plainToken: string; session: Session } {
  // Delete old session if present
  if (oldCookieToken) {
    const oldHash = hashToken(oldCookieToken);
    tx.delete(sessions).where(eq(sessions.id, oldHash)).run();
  }

  return createSession(tx, userId, meta);
}

/**
 * Destroy a session (logout).
 * Can be called outside a transaction since it's the final action before redirect.
 */
export function destroySession(cookieToken: string): void {
  const tokenHash = hashToken(cookieToken);
  db.delete(sessions).where(eq(sessions.id, tokenHash)).run();
}
