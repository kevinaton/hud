/**
 * lib/db/users.ts
 *
 * Query helpers for the users table.
 * All user-facing write helpers include audit log writes (via hud-audit invariant).
 * userId is always the first parameter for per-user data functions.
 */

import { writeAuditLog } from '@/lib/audit/index';
import type { AuditActor } from '@/lib/audit/index';
import { users } from '@hud/db';
import type { User } from '@hud/db';
import { eq } from 'drizzle-orm';
import { db } from './index';

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Look up a user by email (case-normalized).
 * Returns the user row or undefined.
 */
export function getUserByEmail(email: string): User | undefined {
  return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
}

/**
 * Look up a user by ID.
 */
export function getUserById(userId: number): User | undefined {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName?: string;
}

export interface ReqCtx {
  ipAddress?: string;
  userAgent?: string;
  actor?: AuditActor;
}

/**
 * Create a new user and write a signup audit entry.
 * Must be called inside a Drizzle transaction for atomicity with audit.
 */
export function createUser(input: CreateUserInput, ctx: ReqCtx): User {
  return db.transaction((tx) => {
    const user = tx
      .insert(users)
      .values({
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        displayName: input.displayName ?? null,
      })
      .returning()
      .get();

    if (!user) throw new Error('Failed to create user');

    writeAuditLog(tx, {
      userId: user.id,
      actor: ctx.actor ?? 'anon',
      action: 'signup',
      entity: 'user',
      entityId: String(user.id),
      payload: {
        email_hint: maskEmail(user.email),
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return user;
  });
}

/**
 * Update a user's password hash (used by the CLI reset-password script).
 * Writes a password_reset audit entry with actor='system'.
 */
export function updatePasswordHash(userId: number, newHash: string, ctx: ReqCtx): void {
  db.transaction((tx) => {
    tx.update(users)
      .set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId))
      .run();

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor ?? 'system',
      action: 'update',
      entity: 'user',
      entityId: String(userId),
      payload: { field: 'password_hash', note: 'reset via CLI' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mask an email for audit log payload: kevin@example.com → k***@example.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}
