/**
 * lib/db/airbnb.ts
 *
 * Audit-aware domain lib for Airbnb reservations, payouts, and payout items.
 *
 * Per hud-db skill: userId is always the first parameter.
 * Per hud-audit skill: every write runs in a db.transaction with writeAuditLog.
 * Per hud-money skill: all monetary fields are signed INTEGER centavos.
 *
 * Upsert semantics (keyed by confirmation code):
 *   upsertReservation — creates or updates a reservation row
 *   markCanceled      — upserts with status='canceled' (creates stub if unseen)
 *   recordPayout      — inserts payout + items; asserts items sum = total
 *   postPayoutToCashflow — creates cashflow transaction for approved payout
 */

import { writeAuditLog } from '@/lib/audit/index';
import {
  airbnbPayoutItems,
  airbnbPayouts,
  airbnbReservations,
  appSettings as appSettingsTable,
  categories,
  transactions,
} from '@hud/db';
import type { AirbnbPayout, AirbnbPayoutItem, AirbnbReservation } from '@hud/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './index';
import type { ReqCtx } from './transactions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpsertReservationInput {
  confirmationCode: string;
  listingId?: string | null;
  listingName?: string | null;
  guestName?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  nights?: number | null;
  guestsCount?: number | null;
  grossTotalMinor?: number | null;
  cleaningFeeMinor?: number | null;
  hostServiceFeeMinor?: number | null;
  projectedEarningMinor?: number | null;
  sourceLogEntryId?: number | null;
}

export interface RecordPayoutInput {
  externalRef: string;
  currency?: string;
  payoutTotalMinor: number; // INTEGER centavos — per hud-money
  sentDate?: string | null;
  expectedArrivalDate?: string | null;
  bankAccountLabel?: string | null;
  airbnbAccountId?: string | null;
  sourceLogEntryId?: number | null;
  items: RecordPayoutItemInput[];
}

export interface RecordPayoutItemInput {
  confirmationCode: string;
  guestName?: string | null;
  amountMinor: number; // INTEGER centavos
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  listingId?: string | null;
  listingName?: string | null;
}

// ---------------------------------------------------------------------------
// upsertReservation
//
// Creates a new reservation or updates existing fields by confirmation code.
// On conflict (same user_id + confirmation_code), merges non-null fields.
// Writes one audit_log row.
// ---------------------------------------------------------------------------
export function upsertReservation(
  userId: number,
  input: UpsertReservationInput,
  ctx: ReqCtx,
): AirbnbReservation {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(airbnbReservations)
      .where(
        and(
          eq(airbnbReservations.userId, userId),
          eq(airbnbReservations.confirmationCode, input.confirmationCode),
        ),
      )
      .get();

    if (existing) {
      // Build update set — only merge non-null fields
      const setValues: Partial<typeof airbnbReservations.$inferInsert> = {
        updatedAt: sql`(datetime('now'))` as unknown as string,
      };
      if (input.listingId != null) setValues.listingId = input.listingId;
      if (input.listingName != null) setValues.listingName = input.listingName;
      if (input.guestName != null) setValues.guestName = input.guestName;
      if (input.checkIn != null) setValues.checkIn = input.checkIn;
      if (input.checkOut != null) setValues.checkOut = input.checkOut;
      if (input.nights != null) setValues.nights = input.nights;
      if (input.guestsCount != null) setValues.guestsCount = input.guestsCount;
      if (input.grossTotalMinor != null) setValues.grossTotalMinor = input.grossTotalMinor;
      if (input.cleaningFeeMinor != null) setValues.cleaningFeeMinor = input.cleaningFeeMinor;
      if (input.hostServiceFeeMinor != null)
        setValues.hostServiceFeeMinor = input.hostServiceFeeMinor;
      if (input.projectedEarningMinor != null)
        setValues.projectedEarningMinor = input.projectedEarningMinor;
      if (input.sourceLogEntryId != null) setValues.sourceLogEntryId = input.sourceLogEntryId;

      const row = tx
        .update(airbnbReservations)
        .set(setValues)
        .where(eq(airbnbReservations.id, existing.id))
        .returning()
        .get();

      if (!row) throw new Error('upsertReservation: update returned no row');

      writeAuditLog(tx, {
        userId,
        actor: ctx.actor,
        action: 'update',
        entity: 'airbnb_reservation',
        entityId: String(row.id),
        payload: { confirmationCode: input.confirmationCode, fields: Object.keys(setValues) },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return row;
    }

    // Insert new reservation
    const row = tx
      .insert(airbnbReservations)
      .values({
        userId,
        confirmationCode: input.confirmationCode,
        listingId: input.listingId ?? null,
        listingName: input.listingName ?? null,
        guestName: input.guestName ?? null,
        checkIn: input.checkIn ?? null,
        checkOut: input.checkOut ?? null,
        nights: input.nights ?? null,
        guestsCount: input.guestsCount ?? null,
        status: 'confirmed',
        currency: 'PHP',
        grossTotalMinor: input.grossTotalMinor ?? null,
        cleaningFeeMinor: input.cleaningFeeMinor ?? null,
        hostServiceFeeMinor: input.hostServiceFeeMinor ?? null,
        projectedEarningMinor: input.projectedEarningMinor ?? null,
        realizedEarningMinor: null,
        sourceLogEntryId: input.sourceLogEntryId ?? null,
      })
      .returning()
      .get();

    if (!row) throw new Error('upsertReservation: insert returned no row');

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'create',
      entity: 'airbnb_reservation',
      entityId: String(row.id),
      payload: {
        confirmationCode: row.confirmationCode,
        projectedEarningMinor: row.projectedEarningMinor,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  });
}

// ---------------------------------------------------------------------------
// markCanceled
//
// Sets status='canceled' on a reservation by confirmation code.
// Creates a stub row if no reservation exists yet (for cancellations received
// before a confirmation email, or for historical bookings).
// ---------------------------------------------------------------------------
export function markCanceled(
  userId: number,
  confirmationCode: string,
  input: {
    listingId?: string | null;
    listingName?: string | null;
    guestName?: string | null;
    dateRangeStart?: string | null;
    dateRangeEnd?: string | null;
    sourceLogEntryId?: number | null;
  },
  ctx: ReqCtx,
): AirbnbReservation {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(airbnbReservations)
      .where(
        and(
          eq(airbnbReservations.userId, userId),
          eq(airbnbReservations.confirmationCode, confirmationCode),
        ),
      )
      .get();

    if (existing) {
      const setValues: Partial<typeof airbnbReservations.$inferInsert> = {
        status: 'canceled',
        updatedAt: sql`(datetime('now'))` as unknown as string,
      };
      if (input.listingId != null) setValues.listingId = input.listingId;
      if (input.listingName != null) setValues.listingName = input.listingName;
      if (input.guestName != null) setValues.guestName = input.guestName;
      if (input.sourceLogEntryId != null) setValues.sourceLogEntryId = input.sourceLogEntryId;

      const row = tx
        .update(airbnbReservations)
        .set(setValues)
        .where(eq(airbnbReservations.id, existing.id))
        .returning()
        .get();

      if (!row) throw new Error('markCanceled: update returned no row');

      writeAuditLog(tx, {
        userId,
        actor: ctx.actor,
        action: 'update',
        entity: 'airbnb_reservation',
        entityId: String(row.id),
        payload: { confirmationCode, status: 'canceled' },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return row;
    }

    // Stub insert for unseen confirmation code
    const row = tx
      .insert(airbnbReservations)
      .values({
        userId,
        confirmationCode,
        listingId: input.listingId ?? null,
        listingName: input.listingName ?? null,
        guestName: input.guestName ?? null,
        checkIn: input.dateRangeStart ?? null,
        checkOut: input.dateRangeEnd ?? null,
        nights: null,
        guestsCount: null,
        status: 'canceled',
        currency: 'PHP',
        grossTotalMinor: null,
        cleaningFeeMinor: null,
        hostServiceFeeMinor: null,
        projectedEarningMinor: null,
        realizedEarningMinor: null,
        sourceLogEntryId: input.sourceLogEntryId ?? null,
      })
      .returning()
      .get();

    if (!row) throw new Error('markCanceled: stub insert returned no row');

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'create',
      entity: 'airbnb_reservation',
      entityId: String(row.id),
      payload: { confirmationCode, status: 'canceled', stub: true },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  });
}

// ---------------------------------------------------------------------------
// recordPayout
//
// Inserts a payout row + all its items in a single transaction.
// ASSERTION: SUM(items.amountMinor) must equal input.payoutTotalMinor.
//   If not → throws (caller marks entry parse_failed — never touches ledger).
// Idempotent by (userId, externalRef) — returns existing row if already stored.
// After insert, upserts realized_earning_minor + status='paid_out' per item.
// Writes audit_log rows for payout + each reservation update.
// ---------------------------------------------------------------------------
export function recordPayout(
  userId: number,
  input: RecordPayoutInput,
  ctx: ReqCtx,
): { payout: AirbnbPayout; items: AirbnbPayoutItem[] } {
  // Guard: items must sum to total before touching DB
  const itemsSum = input.items.reduce((sum, item) => sum + item.amountMinor, 0);
  if (itemsSum !== input.payoutTotalMinor) {
    throw new Error(
      `recordPayout: items sum ${itemsSum} ≠ payout total ${input.payoutTotalMinor} for ${input.externalRef}`,
    );
  }

  return db.transaction((tx) => {
    // Idempotency: check if payout already exists
    const existing = tx
      .select()
      .from(airbnbPayouts)
      .where(
        and(eq(airbnbPayouts.userId, userId), eq(airbnbPayouts.externalRef, input.externalRef)),
      )
      .get();

    if (existing) {
      const existingItems = tx
        .select()
        .from(airbnbPayoutItems)
        .where(eq(airbnbPayoutItems.payoutId, existing.id))
        .all();
      return { payout: existing, items: existingItems };
    }

    // Insert payout row
    const payout = tx
      .insert(airbnbPayouts)
      .values({
        userId,
        externalRef: input.externalRef,
        currency: input.currency ?? 'PHP',
        payoutTotalMinor: input.payoutTotalMinor,
        sentDate: input.sentDate ?? null,
        expectedArrivalDate: input.expectedArrivalDate ?? null,
        bankAccountLabel: input.bankAccountLabel ?? null,
        airbnbAccountId: input.airbnbAccountId ?? null,
        sourceLogEntryId: input.sourceLogEntryId ?? null,
        cashflowTransactionId: null,
      })
      .returning()
      .get();

    if (!payout) throw new Error('recordPayout: insert returned no row');

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'create',
      entity: 'airbnb_payout',
      entityId: String(payout.id),
      payload: { externalRef: payout.externalRef, payoutTotalMinor: payout.payoutTotalMinor },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Insert items and update reservations
    const insertedItems: AirbnbPayoutItem[] = [];

    for (const itemInput of input.items) {
      const item = tx
        .insert(airbnbPayoutItems)
        .values({
          payoutId: payout.id,
          confirmationCode: itemInput.confirmationCode,
          guestName: itemInput.guestName ?? null,
          amountMinor: itemInput.amountMinor,
          dateRangeStart: itemInput.dateRangeStart ?? null,
          dateRangeEnd: itemInput.dateRangeEnd ?? null,
          listingId: itemInput.listingId ?? null,
          listingName: itemInput.listingName ?? null,
        })
        .returning()
        .get();

      if (!item)
        throw new Error(
          `recordPayout: item insert returned no row for ${itemInput.confirmationCode}`,
        );
      insertedItems.push(item);

      // Upsert reservation realized_earning + status='paid_out'
      const existingResv = tx
        .select({ id: airbnbReservations.id })
        .from(airbnbReservations)
        .where(
          and(
            eq(airbnbReservations.userId, userId),
            eq(airbnbReservations.confirmationCode, itemInput.confirmationCode),
          ),
        )
        .get();

      if (existingResv) {
        tx.update(airbnbReservations)
          .set({
            realizedEarningMinor: itemInput.amountMinor,
            status: 'paid_out',
            updatedAt: sql`(datetime('now'))` as unknown as string,
          })
          .where(eq(airbnbReservations.id, existingResv.id))
          .run();

        writeAuditLog(tx, {
          userId,
          actor: ctx.actor,
          action: 'update',
          entity: 'airbnb_reservation',
          entityId: String(existingResv.id),
          payload: {
            confirmationCode: itemInput.confirmationCode,
            realizedEarningMinor: itemInput.amountMinor,
            status: 'paid_out',
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });
      } else {
        // Backfill: create a stub reservation for historical bookings not seen in email
        tx.insert(airbnbReservations)
          .values({
            userId,
            confirmationCode: itemInput.confirmationCode,
            guestName: itemInput.guestName ?? null,
            listingId: itemInput.listingId ?? null,
            listingName: itemInput.listingName ?? null,
            checkIn: itemInput.dateRangeStart ?? null,
            checkOut: itemInput.dateRangeEnd ?? null,
            nights: null,
            guestsCount: null,
            status: 'paid_out',
            currency: 'PHP',
            grossTotalMinor: null,
            cleaningFeeMinor: null,
            hostServiceFeeMinor: null,
            projectedEarningMinor: null,
            realizedEarningMinor: itemInput.amountMinor,
            sourceLogEntryId: null,
          })
          .run();
      }
    }

    return { payout, items: insertedItems };
  });
}

// ---------------------------------------------------------------------------
// postPayoutToCashflow
//
// Posts a single net income transaction for an approved payout.
// Per Ticket 57 / blueprint L5b:
//   - source='airbnb'
//   - external_id='airbnb:payout:<externalRef>'
//   - amountMinor = payoutTotalMinor (centavo integer — no conversion per hud-money)
//   - occurredAt = sentDate (Asia/Manila +08:00)
//   - category = 'Airbnb' (findOrCreate as 'income')
//   - actor = 'system:logs-payout'
//
// Idempotency guard: if cashflow_transaction_id already set → skip silently.
// Sets airbnb_payouts.cashflow_transaction_id after posting.
// ---------------------------------------------------------------------------
export function postPayoutToCashflow(userId: number, payoutId: number, ctx: ReqCtx): void {
  db.transaction((tx) => {
    const payout = tx
      .select()
      .from(airbnbPayouts)
      .where(and(eq(airbnbPayouts.id, payoutId), eq(airbnbPayouts.userId, userId)))
      .get();

    if (!payout) throw new Error(`postPayoutToCashflow: payout ${payoutId} not found`);

    // Idempotency guard
    if (payout.cashflowTransactionId != null) {
      return; // Already posted — skip silently
    }

    // Find or create 'Airbnb' income category
    let category = tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.name, 'Airbnb')))
      .get();

    if (!category) {
      category =
        tx
          .insert(categories)
          .values({ userId, name: 'Airbnb', kind: 'income' })
          .returning({ id: categories.id })
          .get() ?? null;
    }

    if (!category) throw new Error('postPayoutToCashflow: failed to find/create Airbnb category');

    // Resolve occurred_at: sentDate in Asia/Manila (+08:00), fallback to now
    const occurredAt = payout.sentDate
      ? payout.sentDate.includes('T')
        ? payout.sentDate
        : `${payout.sentDate}T00:00:00+08:00`
      : new Date().toISOString();

    const externalId = `airbnb:payout:${payout.externalRef}`;

    // Insert transaction — idempotent by (userId, externalId) UNIQUE index
    const txRow = tx
      .insert(transactions)
      .values({
        userId,
        item: 'Airbnb payout',
        amountMinor: payout.payoutTotalMinor, // centavo integer — no conversion per hud-money
        currency: payout.currency,
        occurredAt,
        categoryId: category.id,
        notes: `Payout ref: ${payout.externalRef}`,
        source: 'airbnb',
        externalId,
      })
      .onConflictDoNothing()
      .returning()
      .get();

    // Resolve the transaction id (either newly inserted or pre-existing)
    const transactionId: number | undefined =
      txRow?.id ??
      tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.externalId, externalId)))
        .get()?.id;

    if (transactionId == null)
      throw new Error('postPayoutToCashflow: could not resolve transaction id');

    // Link payout → cashflow transaction
    tx.update(airbnbPayouts)
      .set({
        cashflowTransactionId: transactionId,
        updatedAt: sql`(datetime('now'))` as unknown as string,
      })
      .where(eq(airbnbPayouts.id, payoutId))
      .run();

    // Only write audit if we created a new transaction
    if (txRow) {
      writeAuditLog(tx, {
        userId,
        actor: ctx.actor,
        action: 'create',
        entity: 'transaction',
        entityId: String(txRow.id),
        payload: {
          source: 'airbnb',
          externalId,
          amountMinor: txRow.amountMinor,
          payoutId,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Balance sheet read queries
// ---------------------------------------------------------------------------

/** List all reservations for balance sheet view, newest check-in first. */
export function listReservations(userId: number): AirbnbReservation[] {
  return db
    .select()
    .from(airbnbReservations)
    .where(eq(airbnbReservations.userId, userId))
    .orderBy(desc(airbnbReservations.checkIn))
    .all();
}

/** List all payouts for history view, newest first. */
export function listPayouts(userId: number): AirbnbPayout[] {
  return db
    .select()
    .from(airbnbPayouts)
    .where(eq(airbnbPayouts.userId, userId))
    .orderBy(desc(airbnbPayouts.sentDate))
    .all();
}

/** List payout items for a specific payout. */
export function listPayoutItems(payoutId: number): AirbnbPayoutItem[] {
  return db.select().from(airbnbPayoutItems).where(eq(airbnbPayoutItems.payoutId, payoutId)).all();
}

/** Aggregated totals for the balance sheet summary. All values are INTEGER centavos. */
export interface AirbnbTotals {
  totalProjectedMinor: number;
  totalRealizedMinor: number;
  countConfirmed: number;
  countCanceled: number;
  countPaidOut: number;
}

export function getAirbnbTotals(userId: number): AirbnbTotals {
  const row = db
    .select({
      totalProjected: sql<number>`COALESCE(SUM(CASE WHEN status != 'canceled' THEN projected_earning_minor ELSE 0 END), 0)`,
      totalRealized: sql<number>`COALESCE(SUM(CASE WHEN status != 'canceled' THEN realized_earning_minor ELSE 0 END), 0)`,
      countConfirmed: sql<number>`SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)`,
      countCanceled: sql<number>`SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END)`,
      countPaidOut: sql<number>`SUM(CASE WHEN status = 'paid_out' THEN 1 ELSE 0 END)`,
    })
    .from(airbnbReservations)
    .where(eq(airbnbReservations.userId, userId))
    .get();

  return {
    totalProjectedMinor: Math.trunc(Number(row?.totalProjected ?? 0)),
    totalRealizedMinor: Math.trunc(Number(row?.totalRealized ?? 0)),
    countConfirmed: Math.trunc(Number(row?.countConfirmed ?? 0)),
    countCanceled: Math.trunc(Number(row?.countCanceled ?? 0)),
    countPaidOut: Math.trunc(Number(row?.countPaidOut ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// App settings helpers (used by logs lib and settings panel)
// ---------------------------------------------------------------------------

/** Get a typed app setting value, or undefined if not set. */
export function getAppSetting(userId: number, key: string): string | undefined {
  const row = db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(and(eq(appSettingsTable.userId, userId), eq(appSettingsTable.key, key)))
    .get();
  return row?.value;
}

/** Upsert an app setting; writes audit_log entry per hud-audit. */
export function setAppSetting(userId: number, key: string, value: string, ctx: ReqCtx): void {
  db.transaction((tx) => {
    tx.insert(appSettingsTable)
      .values({ userId, key, value })
      .onConflictDoUpdate({
        target: [appSettingsTable.userId, appSettingsTable.key],
        set: { value, updatedAt: sql`(datetime('now'))` as unknown as string },
      })
      .run();

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'update',
      entity: 'app_setting',
      entityId: `${userId}:${key}`,
      payload: { key, value },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  });
}
