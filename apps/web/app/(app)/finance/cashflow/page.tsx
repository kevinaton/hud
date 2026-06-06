/**
 * app/(app)/finance/cashflow/page.tsx
 *
 * Cashflow read-only page — React Server Component.
 *
 * Layout (per Figma node-id=309-631 and hud-ui skill):
 *   TabBar (Cashflow active / Report)
 *   Hero card: net income + delta badge
 *   Sub-cards row: Gross | Expense (each with delta badge)
 *   HazardStripe divider
 *   TRANSACTIONS header + [+] placeholder button
 *   Scrollable TransactionRow list
 *
 * All aggregations are computed server-side on each request — no external cache,
 * no client-side fetching. Direct SQLite read via Drizzle.
 *
 * Period: current calendar month in Asia/Manila timezone (UTC+8).
 * Delta: (current - prior) / |prior|. Zero prior → shows "—".
 */

import { CashflowTransactionSection } from '@/components/hud/CashflowTransactionSection';
import { GridOverlay } from '@/components/hud/GridOverlay';
import { HazardStripe } from '@/components/hud/HazardStripe';
import { Money } from '@/components/hud/Money';
import { TabBar } from '@/components/hud/TabBar';
import { requireSession } from '@/lib/auth/index';
import { listCategories } from '@/lib/db/categories';
import {
  calcDelta,
  getCurrentPeriod,
  getMonthlyAggregations,
  getPriorPeriod,
  listTransactions,
} from '@/lib/db/transactions';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { label: 'Cashflow', href: '/finance/cashflow' },
  { label: 'Report', href: '/finance/cashflow/report' },
];

/** Month names for the period label — hardcoded, locale-independent. */
const MONTH_NAMES = [
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CashflowPage() {
  // Auth — requireSession() is called in (app)/layout.tsx but we need userId here.
  // Calling it again is safe (it only extends TTL once per request via sliding window).
  const ctx = await requireSession();
  const { userId } = ctx;

  // Current and prior period
  const { year, month } = getCurrentPeriod();
  const { year: priorYear, month: priorMonth } = getPriorPeriod(year, month);

  // Aggregations (server-side, synchronous SQLite reads)
  const current = getMonthlyAggregations(userId, year, month);
  const prior = getMonthlyAggregations(userId, priorYear, priorMonth);

  // Delta calculations — null = zero-prior edge case → display "—"
  const netDelta = calcDelta(current.net, prior.net);
  const grossDelta = calcDelta(current.gross, prior.gross);
  const expenseDelta = calcDelta(current.expense, prior.expense);

  // Transaction list for current month
  const txRows = listTransactions(userId, year, month);

  // Categories for the add-transaction modal combobox
  const categoryList = listCategories(userId);

  // Period label (e.g. "June 2026")
  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <div className="relative flex flex-col flex-1 bg-background">
      <GridOverlay />

      <div className="relative z-10 flex flex-col flex-1">
        {/* Tab bar */}
        <TabBar tabs={TABS} active="/finance/cashflow" />

        {/* Main content — padded container */}
        <div className="flex flex-col flex-1 p-4">
          <section className="border border-border">
            {/* ---------------------------------------------------------------- */}
            {/* Hero card — Net Income                                           */}
            {/* ---------------------------------------------------------------- */}
            <div className="p-4">
              {/* Net income amount */}
              <div className="flex items-baseline gap-3 flex-wrap">
                <Money
                  amountMinor={current.net}
                  currency="PHP"
                  variant="neutral"
                  className="font-display tabular text-foreground"
                  style={{
                    fontSize: '64px',
                    fontWeight: 400,
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                  }}
                />
                {/* Delta badge */}
                {netDelta !== null ? <NetDeltaBadge delta={netDelta} /> : <DashBadge />}
              </div>

              {/* "Net Income" label + period */}
              <div className="mt-2 flex items-center gap-3">
                <span
                  className="font-body text-muted uppercase"
                  style={{ fontSize: '12px', letterSpacing: '0.18em' }}
                >
                  Net Income
                </span>
                <span
                  className="font-body text-muted-2"
                  style={{ fontSize: '11px', letterSpacing: '0.1em' }}
                >
                  {periodLabel}
                </span>
              </div>
            </div>

            <div className="flex flex-col">
              {/* ---------------------------------------------------------------- */}
              {/* Sub-cards — Gross | Expense                                      */}
              {/* ---------------------------------------------------------------- */}
              <div className="grid grid-cols-2">
                {/* Gross */}
                <div className="flex flex-col gap-2 p-4">
                  <Money
                    amountMinor={current.gross}
                    currency="PHP"
                    variant="neutral"
                    className="font-display tabular text-foreground"
                    style={{ fontSize: '20px', fontWeight: 400, lineHeight: 1 }}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-body text-muted uppercase"
                      style={{ fontSize: '11px', letterSpacing: '0.12em' }}
                    >
                      Gross
                    </span>
                    {grossDelta !== null ? <SubDeltaBadge delta={grossDelta} /> : <DashBadgeSm />}
                  </div>
                </div>

                {/* Expense — amount displayed as positive (absolute value) */}
                <div className="flex flex-col gap-2 p-4">
                  <Money
                    amountMinor={current.expense}
                    currency="PHP"
                    variant="neutral"
                    className="font-display tabular text-foreground"
                    style={{ fontSize: '20px', fontWeight: 400, lineHeight: 1 }}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-body text-muted uppercase"
                      style={{ fontSize: '11px', letterSpacing: '0.12em' }}
                    >
                      Expense
                    </span>
                    {expenseDelta !== null ? (
                      <SubDeltaBadge delta={expenseDelta} />
                    ) : (
                      <DashBadgeSm />
                    )}
                  </div>
                </div>
              </div>

              {/* ---------------------------------------------------------------- */}
              {/* HazardStripe divider                                             */}
              {/* ---------------------------------------------------------------- */}
              {/* Full-bleed: negative horizontal margin to break out of px-4 */}
              <div className="border-t border-border">
                <HazardStripe height={18} />
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* TRANSACTIONS header + [+] button + clickable rows              */}
          {/* (client component — manages add/edit modal state)               */}
          {/* ---------------------------------------------------------------- */}
          <CashflowTransactionSection
            categories={categoryList}
            transactions={txRows.map((tx) => ({
              id: tx.id,
              item: tx.item,
              amountMinor: tx.amountMinor,
              currency: tx.currency,
              occurredAt: tx.occurredAt,
              category: tx.categoryName ?? undefined,
              notes: tx.notes ?? null,
            }))}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal sub-components (server-only, no "use client")
// ---------------------------------------------------------------------------

/**
 * Hero delta badge — "+20% INC" (cyan) or "-20% DEC" (red).
 * Matches the Figma pattern and hud-money display rules.
 */
function NetDeltaBadge({ delta }: { delta: number }) {
  const isPositive = delta >= 0;
  const sign = isPositive ? '+' : '';
  // Per hud-money skill: "INC" uppercase if positive, "DEC" uppercase if negative
  const label = isPositive ? 'INC' : 'DEC';

  return (
    <span
      className={cn(
        'tabular font-display font-[500] uppercase',
        isPositive ? 'text-accent' : 'text-destructive',
      )}
      style={{ fontSize: '13px', letterSpacing: '0.1em' }}
    >
      {sign}
      {Math.abs(delta)}% {label}
    </span>
  );
}

/**
 * Sub-card delta badge — "+5%" (success green) or "-20%" (destructive red).
 */
function SubDeltaBadge({ delta }: { delta: number }) {
  const isPositive = delta >= 0;
  const sign = isPositive ? '+' : '';

  return (
    <span
      className={cn(
        'tabular font-display font-[500]',
        isPositive ? 'text-success' : 'text-destructive',
      )}
      style={{ fontSize: '11px', letterSpacing: '0.06em' }}
    >
      {sign}
      {delta}%
    </span>
  );
}

/** "—" badge — shown when prior month had zero transactions (undefined delta). */
function DashBadge() {
  return (
    <span
      className="font-body text-muted"
      style={{ fontSize: '13px', letterSpacing: '0.06em' }}
      aria-label="No prior month data"
    >
      —
    </span>
  );
}

/** Smaller "—" badge for sub-cards. */
function DashBadgeSm() {
  return (
    <span
      className="font-body text-muted"
      style={{ fontSize: '11px' }}
      aria-label="No prior month data"
    >
      —
    </span>
  );
}
