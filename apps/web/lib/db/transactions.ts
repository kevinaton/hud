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
