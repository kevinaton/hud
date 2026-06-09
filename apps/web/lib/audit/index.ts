/**
 * lib/audit/index.ts
 *
 * writeAuditLog — the ONE function that inserts into audit_log.
 *
 * INVARIANT (from hud-audit skill):
 *   Every successful state-changing action writes exactly one audit_log row
 *   in the SAME Drizzle transaction as the change.
 *
 * Usage:
 *   import { writeAuditLog } from '@/lib/audit';
 *
 *   db.transaction((tx) => {
 *     const [row] = tx.insert(transactions).values({ ... }).returning();
 *     writeAuditLog(tx, {
 *       userId: ctx.userId,
 *       actor: 'user',
 *       action: 'create',
 *       entity: 'transaction',
 *       entityId: String(row.id),
 *       payload: { item: row.item, amountMinor: row.amountMinor },
 *     });
 *     return row;
 *   });
 */

import type { DrizzleTx } from '@/lib/db/index';
import { auditLog } from '@hud/db';
import type { AuditAction } from '@hud/db';

// ---------------------------------------------------------------------------
// Actor: who performed the action
// ---------------------------------------------------------------------------
export type AuditActor =
  | 'user'
  | 'anon'
  | 'system'
  | `agent:${string}`
  | `platform:${string}`;

// ---------------------------------------------------------------------------
// AuditEntry: the parameters for writeAuditLog
// ---------------------------------------------------------------------------
export interface AuditEntry {
  /** user_id of the authenticated user, or null for pre-auth events. */
  userId: number | null;
  /** Who performed the action. */
  actor: AuditActor;
  /** Closed set of action verbs — see hud-audit skill. */
  action: AuditAction;
  /** The type of entity being acted on. */
  entity: 'transaction' | 'category' | 'user' | 'session';
  /** String ID of the affected entity row. Optional for bulk/pre-creation events. */
  entityId?: string;
  /**
   * Structured payload. MUST NOT contain: passwords, hashes, tokens, cookie values.
   * For 'update' actions include only diff (before/after of changed fields).
   */
  payload?: Record<string, unknown>;
  /** Request IP address (from headers / ctx). */
  ipAddress?: string;
  /** Request User-Agent string. */
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// writeAuditLog
//
// Inserts one row into audit_log. MUST be called inside the same Drizzle
// transaction as the underlying state change to guarantee atomicity.
// ---------------------------------------------------------------------------
export function writeAuditLog(tx: DrizzleTx, entry: AuditEntry): void {
  tx.insert(auditLog)
    .values({
      userId: entry.userId ?? null,
      actor: entry.actor,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      payloadJson: entry.payload ? JSON.stringify(entry.payload) : null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    })
    .run();
}
