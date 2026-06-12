/**
 * lib/db/logs.ts
 *
 * Audit-aware domain lib for the Logs pipeline:
 *   listEntries      — paginated/filtered list of log_entries
 *   approveEntry     — pending → recorded; projects to airbnb_* tables
 *   rejectEntry      — pending → rejected
 *   setApprovalRequired — upserts app_settings['logs.approval_required']
 *   upsertRule       — creates/updates a log_rules row
 *   listWhitelist    — returns all log_whitelist rows for the user
 *   enableWhitelist  — sets enabled=1 on a whitelist row
 *   disableWhitelist — sets enabled=0 on a whitelist row
 *
 * Per hud-db skill: userId is always first parameter.
 * Per hud-audit skill: every write has one audit_log row in the same tx.
 * Per hud-money skill: all amounts remain centavo integers throughout.
 *
 * approveEntry wires to Ticket 57:
 *   When kind === 'airbnb.payout', calls postPayoutToCashflow after recording.
 */

import { writeAuditLog } from '@/lib/audit/index';
import {
  airbnbPayouts,
  airbnbReservations,
  appSettings,
  logEntries,
  logRaw,
  logRules,
  logWhitelist,
} from '@hud/db';
import type { LogEntry, LogRule, LogWhitelist } from '@hud/db';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { markCanceled, postPayoutToCashflow, recordPayout, upsertReservation } from './airbnb';
import { db } from './index';
import type { ReqCtx } from './transactions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogStatus = 'pending' | 'recorded' | 'rejected' | 'parse_failed';

export interface ListEntriesFilter {
  status?: LogStatus;
  kind?: string;
  from?: string; // ISO date
  to?: string; // ISO date
  limit?: number;
  offset?: number;
}

export interface LogEntryWithRaw extends LogEntry {
  hasRaw: boolean;
}

// ---------------------------------------------------------------------------
// listEntries
//
// Returns log_entries for the user, optionally filtered by status/kind/date.
// Ordered by received_at DESC (newest first).
// ---------------------------------------------------------------------------
export function listEntries(userId: number, filter: ListEntriesFilter = {}): LogEntry[] {
  const { status, kind, from, to, limit = 50, offset = 0 } = filter;

  let query = db.select().from(logEntries).where(eq(logEntries.userId, userId)).$dynamic();

  if (status) {
    query = query.where(eq(logEntries.status, status));
  }
  if (kind) {
    query = query.where(eq(logEntries.kind, kind));
  }
  if (from) {
    query = query.where(gte(logEntries.receivedAt, from));
  }
  if (to) {
    query = query.where(lte(logEntries.receivedAt, `${to}T23:59:59Z`));
  }

  return query.orderBy(desc(logEntries.receivedAt)).limit(limit).offset(offset).all();
}

// ---------------------------------------------------------------------------
// approveEntry
//
// State machine: pending → recorded
//
// 1. Validates entry exists and is in 'pending' status.
// 2. Parses parsedJson to project into airbnb_* tables.
// 3. Updates log_entry status to 'recorded'.
// 4. Writes audit_log with actor from ctx.
// 5. If kind === 'airbnb.payout', calls postPayoutToCashflow (Ticket 57).
//
// The projection step (step 2) fires inside a separate transaction from the
// DB calls in airbnb.ts, but log_entry status update is atomic (same tx).
// On projection failure, the exception propagates and the entry stays pending.
// ---------------------------------------------------------------------------
export function approveEntry(userId: number, entryId: number, ctx: ReqCtx): LogEntry {
  // Read entry first (ownership check implicit via userId)
  const entry = db
    .select()
    .from(logEntries)
    .where(and(eq(logEntries.id, entryId), eq(logEntries.userId, userId)))
    .get();

  if (!entry) throw new Error(`approveEntry: entry ${entryId} not found`);
  if (entry.status !== 'pending') {
    throw new Error(`approveEntry: entry ${entryId} is not pending (status=${entry.status})`);
  }

  // Project into airbnb_* based on kind
  if (entry.parsedJson) {
    const parsed = JSON.parse(entry.parsedJson) as Record<string, unknown>;
    projectParsedEntry(userId, entry.kind, parsed, entryId, ctx);
  }

  // Update log_entry status → recorded
  const updated = db.transaction((tx) => {
    const row = tx
      .update(logEntries)
      .set({ status: 'recorded', updatedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(logEntries.id, entryId))
      .returning()
      .get();

    if (!row) throw new Error('approveEntry: update returned no row');

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'approve',
      entity: 'log_entry',
      entityId: String(entryId),
      payload: { kind: entry.kind, status: 'recorded' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  });

  // Ticket 57: post payout to cashflow after recording
  if (entry.kind === 'airbnb.payout' && entry.parsedJson) {
    try {
      const parsed = JSON.parse(entry.parsedJson) as Record<string, unknown>;
      const externalRef = entry.externalRef;
      // Find the payout row that was just created
      const payout = db
        .select({ id: airbnbPayouts.id })
        .from(airbnbPayouts)
        .where(and(eq(airbnbPayouts.userId, userId), eq(airbnbPayouts.externalRef, externalRef)))
        .get();

      if (payout) {
        postPayoutToCashflow(userId, payout.id, {
          userId,
          actor: 'system:logs-payout',
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });
      }
    } catch (err) {
      // Log but don't fail the approval — cashflow posting failure should not block recording
      // biome-ignore lint/suspicious/noConsole: server-side error logging
      console.error('approveEntry: postPayoutToCashflow failed', err);
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// projectParsedEntry
//
// Called from approveEntry. Decodes parsedJson and calls the appropriate
// airbnb domain lib function.
// ---------------------------------------------------------------------------
function projectParsedEntry(
  userId: number,
  kind: string,
  parsed: Record<string, unknown>,
  sourceLogEntryId: number,
  ctx: ReqCtx,
): void {
  if (kind === 'airbnb.reservation_confirmed') {
    upsertReservation(
      userId,
      {
        confirmationCode: String(parsed.confirmationCode ?? ''),
        guestName: parsed.guestName != null ? String(parsed.guestName) : null,
        listingId: parsed.listingId != null ? String(parsed.listingId) : null,
        listingName: parsed.listingName != null ? String(parsed.listingName) : null,
        checkIn: parsed.checkIn != null ? String(parsed.checkIn) : null,
        checkOut: parsed.checkOut != null ? String(parsed.checkOut) : null,
        nights: parsed.nights != null ? Number(parsed.nights) : null,
        guestsCount: parsed.guestsCount != null ? Number(parsed.guestsCount) : null,
        grossTotalMinor: parsed.grossTotalMinor != null ? Number(parsed.grossTotalMinor) : null,
        cleaningFeeMinor: parsed.cleaningFeeMinor != null ? Number(parsed.cleaningFeeMinor) : null,
        hostServiceFeeMinor:
          parsed.hostServiceFeeMinor != null ? Number(parsed.hostServiceFeeMinor) : null,
        projectedEarningMinor:
          parsed.projectedEarningMinor != null ? Number(parsed.projectedEarningMinor) : null,
        sourceLogEntryId,
      },
      ctx,
    );
    return;
  }

  if (kind === 'airbnb.cancellation') {
    const code = String(parsed.confirmationCode ?? '');
    if (!code) return;
    markCanceled(
      userId,
      code,
      {
        listingId: parsed.listingId != null ? String(parsed.listingId) : null,
        listingName: parsed.listingName != null ? String(parsed.listingName) : null,
        guestName: parsed.guestName != null ? String(parsed.guestName) : null,
        sourceLogEntryId,
      },
      ctx,
    );
    return;
  }

  if (kind === 'airbnb.payout') {
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = (rawItems as Array<Record<string, unknown>>).map((item) => ({
      confirmationCode: String(item.confirmationCode ?? ''),
      guestName: item.guestName != null ? String(item.guestName) : null,
      amountMinor: Number(item.amountMinor ?? 0),
      dateRangeStart: item.dateRangeStart != null ? String(item.dateRangeStart) : null,
      dateRangeEnd: item.dateRangeEnd != null ? String(item.dateRangeEnd) : null,
      listingId: item.listingId != null ? String(item.listingId) : null,
      listingName: item.listingName != null ? String(item.listingName) : null,
    }));

    recordPayout(
      userId,
      {
        externalRef: String(parsed.externalRef ?? ''),
        payoutTotalMinor: Number(parsed.payoutTotalMinor ?? 0),
        sentDate: parsed.sentDate != null ? String(parsed.sentDate) : null,
        expectedArrivalDate:
          parsed.expectedArrivalDate != null ? String(parsed.expectedArrivalDate) : null,
        bankAccountLabel: parsed.bankAccountLabel != null ? String(parsed.bankAccountLabel) : null,
        airbnbAccountId: parsed.airbnbAccountId != null ? String(parsed.airbnbAccountId) : null,
        sourceLogEntryId,
        items,
      },
      ctx,
    );
    return;
  }
}

// ---------------------------------------------------------------------------
// rejectEntry
//
// State machine: pending → rejected
// ---------------------------------------------------------------------------
export function rejectEntry(
  userId: number,
  entryId: number,
  reason: string,
  ctx: ReqCtx,
): LogEntry {
  const entry = db
    .select()
    .from(logEntries)
    .where(and(eq(logEntries.id, entryId), eq(logEntries.userId, userId)))
    .get();

  if (!entry) throw new Error(`rejectEntry: entry ${entryId} not found`);
  if (entry.status !== 'pending') {
    throw new Error(`rejectEntry: entry ${entryId} is not pending (status=${entry.status})`);
  }

  return db.transaction((tx) => {
    const row = tx
      .update(logEntries)
      .set({
        status: 'rejected',
        statusReason: reason,
        updatedAt: sql`(datetime('now'))` as unknown as string,
      })
      .where(eq(logEntries.id, entryId))
      .returning()
      .get();

    if (!row) throw new Error('rejectEntry: update returned no row');

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'reject',
      entity: 'log_entry',
      entityId: String(entryId),
      payload: { reason, kind: entry.kind },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  });
}

// ---------------------------------------------------------------------------
// setApprovalRequired
//
// Upserts app_settings['logs.approval_required'] = 'true' | 'false'.
// ---------------------------------------------------------------------------
export function setApprovalRequired(userId: number, enabled: boolean, ctx: ReqCtx): void {
  const value = enabled ? 'true' : 'false';

  db.transaction((tx) => {
    tx.insert(appSettings)
      .values({ userId, key: 'logs.approval_required', value })
      .onConflictDoUpdate({
        target: [appSettings.userId, appSettings.key],
        set: { value, updatedAt: sql`(datetime('now'))` as unknown as string },
      })
      .run();

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'update',
      entity: 'app_setting',
      entityId: `${userId}:logs.approval_required`,
      payload: { key: 'logs.approval_required', value },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  });
}

// ---------------------------------------------------------------------------
// upsertRule
//
// Inserts or updates a log_rules row for (userId, source, kind, action).
// ---------------------------------------------------------------------------
export interface UpsertRuleInput {
  source?: string;
  sender?: string | null;
  kind: string;
  action: 'auto_approve' | 'ignore';
}

export function upsertRule(userId: number, input: UpsertRuleInput, ctx: ReqCtx): LogRule {
  return db.transaction((tx) => {
    const row = tx
      .insert(logRules)
      .values({
        userId,
        source: input.source ?? 'email',
        sender: input.sender ?? null,
        kind: input.kind,
        action: input.action,
      })
      .onConflictDoUpdate({
        target: [logRules.userId, logRules.source, logRules.kind, logRules.action],
        set: { sender: input.sender ?? null },
      })
      .returning()
      .get();

    if (!row) throw new Error('upsertRule: insert returned no row');

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'create',
      entity: 'log_rule',
      entityId: String(row.id),
      payload: { kind: input.kind, action: input.action, sender: input.sender },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  });
}

// ---------------------------------------------------------------------------
// Whitelist CRUD
// ---------------------------------------------------------------------------

export function listWhitelist(userId: number): LogWhitelist[] {
  return db.select().from(logWhitelist).where(eq(logWhitelist.userId, userId)).all();
}

export function enableWhitelist(userId: number, whitelistId: number, ctx: ReqCtx): LogWhitelist {
  return db.transaction((tx) => {
    const row = tx
      .update(logWhitelist)
      .set({ enabled: 1 })
      .where(and(eq(logWhitelist.id, whitelistId), eq(logWhitelist.userId, userId)))
      .returning()
      .get();

    if (!row) throw new Error(`enableWhitelist: row ${whitelistId} not found`);

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'update',
      entity: 'log_whitelist',
      entityId: String(whitelistId),
      payload: { enabled: true },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  });
}

export function disableWhitelist(userId: number, whitelistId: number, ctx: ReqCtx): LogWhitelist {
  return db.transaction((tx) => {
    const row = tx
      .update(logWhitelist)
      .set({ enabled: 0 })
      .where(and(eq(logWhitelist.id, whitelistId), eq(logWhitelist.userId, userId)))
      .returning()
      .get();

    if (!row) throw new Error(`disableWhitelist: row ${whitelistId} not found`);

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'update',
      entity: 'log_whitelist',
      entityId: String(whitelistId),
      payload: { enabled: false },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  });
}

// ---------------------------------------------------------------------------
// getApprovalRequired
//
// Reads app_settings['logs.approval_required']. Defaults to true.
// ---------------------------------------------------------------------------
export function getApprovalRequired(userId: number): boolean {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(and(eq(appSettings.userId, userId), eq(appSettings.key, 'logs.approval_required')))
    .get();
  return row ? row.value === 'true' : true;
}

// ---------------------------------------------------------------------------
// listRules
// ---------------------------------------------------------------------------
export function listRules(userId: number): LogRule[] {
  return db.select().from(logRules).where(eq(logRules.userId, userId)).all();
}
