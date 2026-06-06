/**
 * lib/db/transactions.ts
 *
 * Query helpers for the transactions table.
 *
 * Per hud-db skill:
 *   - userId is always the first parameter.
 *   - All queries use Drizzle parameterized clauses — no sql.raw with user input.
 *   - Read helpers return typed rows; write helpers run inside db.transaction with audit.
 *
 * Per hud-money skill:
 *   - All amounts are signed integers (amount_minor). No floats.
 */

import { writeAuditLog } from '@/lib/audit/index';
import { categories, transactions } from '@hud/db';
import type { Transaction } from '@hud/db';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { findOrCreateCategory } from './categories';
import { db } from './index';

// ---------------------------------------------------------------------------
// getTransactionById
//
// Returns the transaction with the given id belonging to userId, or null.
// Ownership check is enforced by the userId filter.
// ---------------------------------------------------------------------------
export function getTransactionById(userId: number, transactionId: number): Transaction | null {
  const row = db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
    .get();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A transaction row joined with its category name (for display). */
export interface TransactionWithCategory extends Transaction {
  categoryName: string | null;
}

/** Aggregated money totals for a calendar month, all in minor units (signed integers). */
export interface MonthlyAggregations {
  /** SUM(amount_minor) — can be negative */
  net: number;
  /** SUM(amount_minor) WHERE amount_minor > 0 */
  gross: number;
  /** SUM(-amount_minor) WHERE amount_minor < 0 — always >= 0 for display */
  expense: number;
}

// ---------------------------------------------------------------------------
// getMonthlyAggregations
//
// Returns net / gross / expense for a single calendar month.
// year and month are 1-indexed (month=6 = June).
// ---------------------------------------------------------------------------
export function getMonthlyAggregations(
  userId: number,
  year: number,
  month: number,
): MonthlyAggregations {
  const { from, to } = monthRange(year, month);

  // Single-pass aggregation using SQL CASE expressions
  const row = db
    .select({
      net: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)`,
      gross: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountMinor} > 0 THEN ${transactions.amountMinor} ELSE 0 END), 0)`,
      expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountMinor} < 0 THEN -${transactions.amountMinor} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredAt, from),
        lt(transactions.occurredAt, to),
      ),
    )
    .get();

  if (!row) {
    return { net: 0, gross: 0, expense: 0 };
  }

  // Drizzle returns aggregation results as the SQL type; ensure integers.
  return {
    net: Math.trunc(Number(row.net)),
    gross: Math.trunc(Number(row.gross)),
    expense: Math.trunc(Number(row.expense)),
  };
}

// ---------------------------------------------------------------------------
// listTransactions
//
// Returns all transactions for a calendar month, sorted by occurred_at DESC,
// joined with the category name.
// ---------------------------------------------------------------------------
export function listTransactions(
  userId: number,
  year: number,
  month: number,
): TransactionWithCategory[] {
  const { from, to } = monthRange(year, month);

  const rows = db
    .select({
      id: transactions.id,
      userId: transactions.userId,
      item: transactions.item,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      occurredAt: transactions.occurredAt,
      categoryId: transactions.categoryId,
      notes: transactions.notes,
      source: transactions.source,
      externalId: transactions.externalId,
      createdAt: transactions.createdAt,
      updatedAt: transactions.updatedAt,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredAt, from),
        lt(transactions.occurredAt, to),
      ),
    )
    .orderBy(desc(transactions.occurredAt))
    .all();

  return rows.map((r) => ({
    ...r,
    categoryName: r.categoryName ?? null,
  }));
}

// ---------------------------------------------------------------------------
// calcDelta
//
// Returns the integer percent change from prior → current, or null when
// prior is 0 (undefined delta — display "—").
//
// Examples:
//   calcDelta(1500, 1200) → 25     (+25%)
//   calcDelta(1000, 1500) → -33    (-33%)
//   calcDelta(500,  0)    → null   (division by zero — show "—")
// ---------------------------------------------------------------------------
export function calcDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return Math.round(((current - prior) / Math.abs(prior)) * 100);
}

// ---------------------------------------------------------------------------
// monthRange (internal helper)
//
// Returns ISO-8601 UTC string bounds for a calendar month using the local
// wall-clock dates in Asia/Manila timezone. The "from" is inclusive, "to"
// is exclusive (i.e. the first instant of the following month).
//
// We use UTC midnight offsets rather than IANA timezone calculations because
// better-sqlite3 stores occurred_at as ISO-8601 strings with +08:00 offset.
// Comparing string bounds in UTC handles the Asia/Manila (+08:00) correctly.
// ---------------------------------------------------------------------------
export function monthRange(year: number, month: number): { from: string; to: string } {
  // First moment of the month in Asia/Manila (+08:00) → expressed in UTC
  // Asia/Manila = UTC+8. Month boundary in Manila time = (month, day=1, 00:00:00 +08:00)
  //   = (month, day=1, 16:00:00 UTC) of the *previous* UTC day.
  // We generate ISO-8601 strings with +08:00 suffix to match how occurred_at is stored.
  const pad2 = (n: number) => String(n).padStart(2, '0');

  // "from" = first moment of this month in Asia/Manila
  const fromStr = `${year}-${pad2(month)}-01T00:00:00+08:00`;

  // "to" = first moment of next month in Asia/Manila
  let toYear = year;
  let toMonth = month + 1;
  if (toMonth > 12) {
    toMonth = 1;
    toYear = year + 1;
  }
  const toStr = `${toYear}-${pad2(toMonth)}-01T00:00:00+08:00`;

  return { from: fromStr, to: toStr };
}

// ---------------------------------------------------------------------------
// getCurrentPeriod
//
// Returns { year, month } for the current calendar month in Asia/Manila
// timezone (UTC+8). Falls back to UTC if DEFAULT_TIMEZONE is unset.
//
// We do NOT use Intl.DateTimeFormat / toLocaleString because we need integers
// (year, month) not a formatted string, and we need it to be deterministic.
// ---------------------------------------------------------------------------
export function getCurrentPeriod(): { year: number; month: number } {
  // Asia/Manila is UTC+8. Get current UTC time then add 8 hours.
  const nowUtc = new Date();
  const offsetMs = 8 * 60 * 60 * 1000; // DEFAULT: Asia/Manila = +08:00
  const manilaTime = new Date(nowUtc.getTime() + offsetMs);

  // manilaTime is a "UTC Date" where the UTC fields (getUTC*) reflect Manila time
  const year = manilaTime.getUTCFullYear();
  const month = manilaTime.getUTCMonth() + 1; // 1-indexed

  return { year, month };
}

// ---------------------------------------------------------------------------
// getPriorPeriod
//
// Returns { year, month } for the month prior to the given period.
// ---------------------------------------------------------------------------
export function getPriorPeriod(year: number, month: number): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

// ---------------------------------------------------------------------------
// createTransaction
//
// Inserts a new transaction and writes exactly one audit_log row in the same
// Drizzle transaction (atomic).
//
// Per hud-money skill: amountMinor must be a signed integer — the route handler
// is responsible for converting the decimal input via Math.round(amount * 100).
//
// Per hud-audit skill: writeAuditLog is called inside the same db.transaction.
//
// If categoryName is provided, findOrCreateCategory upserts it (same tx).
// ---------------------------------------------------------------------------

/** The data the route handler passes after Zod parsing + money conversion. */
export interface CreateTransactionDbInput {
  /** Transaction description. */
  item: string;
  /** Signed integer minor units (centavos for PHP). NEVER a float. */
  amountMinor: number;
  /** ISO-8601 date-time string with timezone offset, e.g. "2026-06-05T00:00:00+08:00". */
  occurredAt: string;
  /** Raw category name (may include emoji — stripped inside findOrCreateCategory). */
  categoryName?: string | null;
  /** Optional memo. */
  notes?: string | null;
}

/** Request context forwarded from the route handler to carry audit fields. */
export interface ReqCtx {
  /** Authenticated user id. */
  userId: number;
  /** Actor string for audit_log. Always 'user' for browser sessions. */
  actor: 'user' | 'anon' | 'system' | `agent:${string}`;
  /** IP address from X-Forwarded-For or request.ip. */
  ipAddress?: string;
  /** User-Agent header. */
  userAgent?: string;
}

export function createTransaction(input: CreateTransactionDbInput, ctx: ReqCtx): Transaction {
  // Enforce money invariant: amount must be an integer.
  if (!Number.isInteger(input.amountMinor)) {
    throw new TypeError(
      `createTransaction: amountMinor must be an integer, got ${input.amountMinor}`,
    );
  }

  return db.transaction((tx) => {
    // 1. Resolve category (strip emoji, upsert if new name, same tx)
    let categoryId: number | null = null;
    if (input.categoryName?.trim()) {
      categoryId = findOrCreateCategory(tx, ctx.userId, input.categoryName);
    }

    // 2. Insert the transaction row
    const row = tx
      .insert(transactions)
      .values({
        userId: ctx.userId,
        item: input.item,
        amountMinor: input.amountMinor,
        currency: 'PHP',
        occurredAt: input.occurredAt,
        categoryId: categoryId ?? null,
        notes: input.notes ?? null,
        source: 'manual',
      })
      .returning()
      .get();

    if (!row) {
      throw new Error('createTransaction: insert returned no row');
    }

    // 3. Write audit log (same transaction — atomic)
    writeAuditLog(tx, {
      userId: ctx.userId,
      actor: ctx.actor,
      action: 'create',
      entity: 'transaction',
      entityId: String(row.id),
      payload: {
        item: row.item,
        amountMinor: row.amountMinor,
        currency: row.currency,
        categoryId: row.categoryId,
        occurredAt: row.occurredAt,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  });
}

// ---------------------------------------------------------------------------
// UpdateTransactionDbInput
//
// Only the fields that may be changed are included.
// All are optional — at least one is guaranteed by the route's Zod check.
// ---------------------------------------------------------------------------
export interface UpdateTransactionDbInput {
  item?: string;
  /** Signed integer minor units. NEVER a float. */
  amountMinor?: number;
  /** ISO-8601 date-time string with timezone offset. */
  occurredAt?: string;
  /** Raw category name (stripped/upserted inside this function). null = remove. */
  categoryName?: string | null;
  /** memo. null = clear. */
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers for updateTransaction
// ---------------------------------------------------------------------------

type UpdatePayload = Partial<{
  item: string;
  amountMinor: number;
  occurredAt: string;
  categoryId: number | null;
  notes: string | null;
  updatedAt: string;
}>;

type DiffResult = {
  updatePayload: UpdatePayload;
  beforeDiff: Record<string, unknown>;
  afterDiff: Record<string, unknown>;
};

/**
 * Compare `input` against `existingRow` and return:
 *   - `updatePayload`: the Drizzle `.set()` object (changed fields + updatedAt)
 *   - `beforeDiff` / `afterDiff`: the audit payload diff
 *
 * Extracted to reduce the cognitive complexity of `updateTransaction`.
 */
function buildUpdateDiff(
  existingRow: Transaction,
  input: UpdateTransactionDbInput,
  categoryId: number | null | undefined,
): DiffResult {
  const updatePayload: UpdatePayload = { updatedAt: new Date().toISOString() };
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};

  if (input.item !== undefined && input.item !== existingRow.item) {
    beforeDiff.item = existingRow.item;
    afterDiff.item = input.item;
    updatePayload.item = input.item;
  }
  if (input.amountMinor !== undefined && input.amountMinor !== existingRow.amountMinor) {
    beforeDiff.amountMinor = existingRow.amountMinor;
    afterDiff.amountMinor = input.amountMinor;
    updatePayload.amountMinor = input.amountMinor;
  }
  if (input.occurredAt !== undefined && input.occurredAt !== existingRow.occurredAt) {
    beforeDiff.occurredAt = existingRow.occurredAt;
    afterDiff.occurredAt = input.occurredAt;
    updatePayload.occurredAt = input.occurredAt;
  }
  if (categoryId !== undefined && categoryId !== existingRow.categoryId) {
    beforeDiff.categoryId = existingRow.categoryId;
    afterDiff.categoryId = categoryId;
    updatePayload.categoryId = categoryId;
  }
  if ('notes' in input && input.notes !== existingRow.notes) {
    beforeDiff.notes = existingRow.notes;
    afterDiff.notes = input.notes ?? null;
    updatePayload.notes = input.notes ?? null;
  }

  return { updatePayload, beforeDiff, afterDiff };
}

// ---------------------------------------------------------------------------
// updateTransaction
//
// Applies a partial update to an existing transaction row. Writes one audit
// row containing only the before/after diff of changed fields.
//
// Caller is responsible for the ownership check (403 if userId doesn't match).
// The `existing` row must be fetched first so this function can compute the diff.
// ---------------------------------------------------------------------------
export function updateTransaction(
  userId: number,
  existingRow: Transaction,
  input: UpdateTransactionDbInput,
  ctx: ReqCtx,
): Transaction {
  // Validate integer invariant for amount
  if (input.amountMinor !== undefined && !Number.isInteger(input.amountMinor)) {
    throw new TypeError(
      `updateTransaction: amountMinor must be an integer, got ${input.amountMinor}`,
    );
  }

  return db.transaction((tx) => {
    // 1. Resolve category if provided
    let categoryId: number | null | undefined = undefined;
    if ('categoryName' in input) {
      categoryId = input.categoryName?.trim()
        ? findOrCreateCategory(tx, userId, input.categoryName)
        : null;
    }

    // 2. Build diff (pure helper — reduces complexity here)
    const { updatePayload, beforeDiff, afterDiff } = buildUpdateDiff(
      existingRow,
      input,
      categoryId,
    );

    // 3. Execute update
    const row = tx
      .update(transactions)
      .set(updatePayload)
      .where(and(eq(transactions.id, existingRow.id), eq(transactions.userId, userId)))
      .returning()
      .get();

    if (!row) {
      throw new Error('updateTransaction: update returned no row');
    }

    // 4. Audit log — diff-only payload (per hud-audit skill)
    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'update',
      entity: 'transaction',
      entityId: String(row.id),
      payload: { entity_id: String(row.id), before: beforeDiff, after: afterDiff },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  });
}

// ---------------------------------------------------------------------------
// deleteTransaction
//
// Hard-deletes a transaction row and writes a single audit log entry in the
// same Drizzle transaction. Caller is responsible for the ownership check.
// ---------------------------------------------------------------------------
export function deleteTransaction(userId: number, transactionId: number, ctx: ReqCtx): void {
  db.transaction((tx) => {
    tx.delete(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
      .run();

    writeAuditLog(tx, {
      userId,
      actor: ctx.actor,
      action: 'delete',
      entity: 'transaction',
      entityId: String(transactionId),
      payload: undefined,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  });
}
