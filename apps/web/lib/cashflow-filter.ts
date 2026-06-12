/**
 * lib/cashflow-filter.ts
 *
 * Pure utility — no Next.js or React imports.
 *
 * Parses URL search params for the cashflow date filter and returns
 * pre-computed ISO-8601 string bounds for both the current window and
 * the equivalent prior window (used for delta badge computation).
 *
 * All date arithmetic is performed in Asia/Manila (UTC+8) wall-clock time.
 * Stored occurred_at values carry the +08:00 suffix, so ISO string
 * comparisons in SQLite work correctly.
 *
 * Exported:
 *   resolveFilterRange(searchParams) → FilterRange
 *
 * URL shapes:
 *   ?filter=this-month   (or absent)  → current calendar month
 *   ?filter=30d                       → rolling last 30 days
 *   ?filter=90d                       → rolling last 90 days
 *   ?filter=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 */

import { getCurrentPeriod, getPriorPeriod, monthRange } from '@/lib/db/transactions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilterMode = 'this-month' | '30d' | '90d' | 'custom';

export interface FilterRange {
  /** Inclusive start — ISO-8601 with +08:00 offset */
  from: string;
  /** Exclusive end — ISO-8601 with +08:00 offset */
  to: string;
  /** Inclusive start of the equivalent prior window */
  priorFrom: string;
  /** Exclusive end of the equivalent prior window */
  priorTo: string;
  /** Human-readable display label, e.g. "June 2026", "Last 30 days" */
  label: string;
  /** The resolved filter mode (normalised from the param) */
  mode: FilterMode;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila = UTC+8

/** Return the current Date adjusted so that getUTC* methods return Manila wall-clock values. */
function manilaNow(): Date {
  return new Date(Date.now() + OFFSET_MS);
}

/** Pad a number to 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format a "Manila-adjusted" Date as YYYY-MM-DD. */
function toManilaDateString(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Convert a YYYY-MM-DD string to an ISO-8601 string at midnight Asia/Manila time.
 * e.g. "2026-06-01" → "2026-06-01T00:00:00+08:00"
 */
function dateStringToManilaMidnight(dateStr: string): string {
  return `${dateStr}T00:00:00+08:00`;
}

/**
 * Add `days` calendar days (in Manila wall-clock) to a "Manila-adjusted" Date.
 * Returns a new Date (Manila-adjusted).
 */
function addDays(manilaDate: Date, days: number): Date {
  const result = new Date(manilaDate.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const FULL_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Format a custom range label: "Apr 1 – Jun 12, 2026"
 * Both dates are Manila-adjusted Dates.
 * If start and end are in the same year, only one year is shown.
 */
function formatCustomLabel(fromManila: Date, toManila: Date): string {
  // `to` is exclusive end — display the day before
  const displayTo = addDays(toManila, -1);

  const fromMon = SHORT_MONTH_NAMES[fromManila.getUTCMonth()];
  const fromDay = fromManila.getUTCDate();
  const fromYear = fromManila.getUTCFullYear();

  const toMon = SHORT_MONTH_NAMES[displayTo.getUTCMonth()];
  const toDay = displayTo.getUTCDate();
  const toYear = displayTo.getUTCFullYear();

  if (fromYear === toYear) {
    return `${fromMon} ${fromDay} – ${toMon} ${toDay}, ${toYear}`;
  }
  return `${fromMon} ${fromDay}, ${fromYear} – ${toMon} ${toDay}, ${toYear}`;
}

// ---------------------------------------------------------------------------
// resolveFilterRange
// ---------------------------------------------------------------------------

/**
 * Parse URL search params and return pre-computed ISO-8601 date bounds plus
 * a display label for the cashflow page header.
 *
 * The `searchParams` type matches what Next.js 15 provides from `await searchParams`
 * on an async page: `Record<string, string | string[] | undefined>`.
 *
 * Implementation is pure (no side-effects beyond reading the current wall-clock
 * time). Safe to call in a Server Component or in unit tests.
 */
export function resolveFilterRange(
  searchParams: Record<string, string | string[] | undefined>,
): FilterRange {
  const rawFilter = searchParams.filter;
  const filterParam = Array.isArray(rawFilter) ? rawFilter[0] : rawFilter;

  // -------------------------------------------------------------------------
  // this-month (default)
  // -------------------------------------------------------------------------
  if (!filterParam || filterParam === 'this-month') {
    return resolveThisMonth();
  }

  // -------------------------------------------------------------------------
  // 30d
  // -------------------------------------------------------------------------
  if (filterParam === '30d') {
    return resolveRolling(30);
  }

  // -------------------------------------------------------------------------
  // 90d
  // -------------------------------------------------------------------------
  if (filterParam === '90d') {
    return resolveRolling(90);
  }

  // -------------------------------------------------------------------------
  // custom
  // -------------------------------------------------------------------------
  if (filterParam === 'custom') {
    const rawFrom = searchParams.from;
    const rawTo = searchParams.to;
    const fromParam = Array.isArray(rawFrom) ? rawFrom[0] : rawFrom;
    const toParam = Array.isArray(rawTo) ? rawTo[0] : rawTo;

    const result = resolveCustom(fromParam, toParam);
    if (result !== null) return result;

    // Invalid custom params → fall back to this-month
    return resolveThisMonth();
  }

  // Unknown filter → fall back
  return resolveThisMonth();
}

// ---------------------------------------------------------------------------
// Mode resolvers
// ---------------------------------------------------------------------------

function resolveThisMonth(): FilterRange {
  const { year, month } = getCurrentPeriod();
  const { year: priorYear, month: priorMonth } = getPriorPeriod(year, month);

  const { from, to } = monthRange(year, month);
  const { from: priorFrom, to: priorTo } = monthRange(priorYear, priorMonth);

  const label = `${FULL_MONTH_NAMES[month - 1]} ${year}`;

  return { from, to, priorFrom, priorTo, label, mode: 'this-month' };
}

function resolveRolling(days: number): FilterRange {
  const now = manilaNow();

  // "to" = tomorrow at midnight Manila time (exclusive)
  const toManila = addDays(now, 1);
  toManila.setUTCHours(0, 0, 0, 0);

  // "from" = today-days at midnight Manila time (inclusive)
  const fromManila = new Date(toManila.getTime());
  fromManila.setUTCDate(fromManila.getUTCDate() - days);

  const from = dateStringToManilaMidnight(toManilaDateString(fromManila));
  const to = dateStringToManilaMidnight(toManilaDateString(toManila));

  // Prior window: the same `days` length immediately before `from`
  const priorToManila = new Date(fromManila.getTime()); // exclusive end = start of current window
  const priorFromManila = new Date(priorToManila.getTime());
  priorFromManila.setUTCDate(priorFromManila.getUTCDate() - days);

  const priorFrom = dateStringToManilaMidnight(toManilaDateString(priorFromManila));
  const priorTo = dateStringToManilaMidnight(toManilaDateString(priorToManila));

  const label = days === 30 ? 'Last 30 days' : 'Last 90 days';

  return { from, to, priorFrom, priorTo, label, mode: days === 30 ? '30d' : '90d' };
}

/** Returns null when the params are missing or invalid (caller should fall back). */
function resolveCustom(
  fromParam: string | undefined,
  toParam: string | undefined,
): FilterRange | null {
  if (!fromParam || !toParam) return null;

  // Validate YYYY-MM-DD format
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(fromParam) || !dateRe.test(toParam)) return null;

  // Validate that dates are real calendar dates by parsing
  const fromDate = new Date(`${fromParam}T00:00:00Z`);
  const toDate = new Date(`${toParam}T00:00:00Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null;

  // end must be >= start (we use the exclusive-end convention: to is +1 day)
  if (toDate < fromDate) return null;

  // Inclusive start, exclusive end (to+1 day)
  const from = dateStringToManilaMidnight(fromParam);

  // Exclusive end: &to param is the last visible day → add 1 day
  const toExclusive = new Date(`${toParam}T00:00:00Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const toExclusiveStr = `${toExclusive.getUTCFullYear()}-${pad2(toExclusive.getUTCMonth() + 1)}-${pad2(toExclusive.getUTCDate())}`;
  const to = dateStringToManilaMidnight(toExclusiveStr);

  // Window duration in days
  const windowDays = Math.round(
    (toExclusive.getTime() - new Date(`${fromParam}T00:00:00Z`).getTime()) / (24 * 60 * 60 * 1000),
  );

  // Prior window: shift from/to back by windowDays
  const priorToDate = new Date(`${fromParam}T00:00:00Z`); // exclusive end = start of current
  const priorFromDate = new Date(priorToDate.getTime());
  priorFromDate.setUTCDate(priorFromDate.getUTCDate() - windowDays);

  const priorFrom = dateStringToManilaMidnight(
    `${priorFromDate.getUTCFullYear()}-${pad2(priorFromDate.getUTCMonth() + 1)}-${pad2(priorFromDate.getUTCDate())}`,
  );
  const priorTo = dateStringToManilaMidnight(fromParam); // = priorToDate (midnight Manila)

  // Display label
  const fromManilaAdj = new Date(fromDate.getTime() + OFFSET_MS);
  const toManilaAdj = new Date(toExclusive.getTime() + OFFSET_MS); // exclusive — label shows day before
  const label = formatCustomLabel(fromManilaAdj, toManilaAdj);

  return { from, to, priorFrom, priorTo, label, mode: 'custom' };
}
