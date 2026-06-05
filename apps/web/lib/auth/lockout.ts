/**
 * lib/auth/lockout.ts
 *
 * Per-account lockout logic.
 *
 * Rules:
 *   - 5 consecutive failed attempts → locked_until = now + 15 min
 *   - On successful login: reset failed_attempts = 0, locked_until = NULL
 *   - On attempt while locked: return same error as wrong password (no oracle)
 *     Do NOT increment counter further; do NOT extend lockout window.
 *
 * All reads/writes are synchronous (better-sqlite3 is synchronous).
 *
 * recordFailedAttempt and clearLockout accept a DrizzleTx so they can participate
 * in the caller's transaction alongside audit log writes.
 */

import { db } from '@/lib/db/index';
import type { DrizzleTx } from '@/lib/db/index';
import { users } from '@hud/db';
import { eq } from 'drizzle-orm';

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Check if an account is currently locked.
 * Returns { locked: true, lockedUntil: Date } if locked,
 * { locked: false } otherwise.
 *
 * Reads from the global db (safe to call outside a transaction — read-only).
 */
export function checkLockout(
  userId: number,
): { locked: false } | { locked: true; lockedUntil: Date } {
  const user = db
    .select({ lockedUntil: users.lockedUntil })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user?.lockedUntil) return { locked: false };

  const lockedUntil = new Date(user.lockedUntil);
  if (lockedUntil > new Date()) {
    return { locked: true, lockedUntil };
  }

  return { locked: false };
}

/**
 * Record a failed login attempt for an account.
 * If this reaches the threshold, also sets locked_until.
 *
 * Returns the new failed_attempts count.
 * MUST be called with a DrizzleTx so the write is atomic with the audit log.
 */
export function recordFailedAttempt(tx: DrizzleTx, userId: number): number {
  const user = tx
    .select({ failedAttempts: users.failedAttempts })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  const current = user?.failedAttempts ?? 0;
  const next = current + 1;

  const lockedUntil =
    next >= LOCKOUT_THRESHOLD
      ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString()
      : null;

  tx.update(users)
    .set({
      failedAttempts: next,
      lockedUntil,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();

  return next;
}

/**
 * Clear the lockout state after a successful login.
 * MUST be called with a DrizzleTx so the write is atomic with session creation.
 */
export function clearLockout(tx: DrizzleTx, userId: number): void {
  tx.update(users)
    .set({
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();
}
