/**
 * app/(app)/finance/airbnb/page.tsx
 *
 * Airbnb balance sheet — React Server Component (read-only).
 *
 * Layout (per Figma node-id=346-113 and Ticket 60):
 *   Summary card (full-width stacked):
 *     top-right: AirbnbFilterBar ("This month ▾")
 *     Projected row: large amount + % change badge
 *     Realized row: large amount + % change badge
 *     Status counts: Confirmed | Paid Out | Cancelled (inline)
 *     HazardStripe at bottom of summary card
 *
 *   AirbnbTabBar: Bookings | Pay Outs | Cancelled
 *   N total (right-aligned below tabs)
 *
 *   Bookings tab: BookingCard per active reservation
 *   Pay Outs tab: AirbnbPayoutCard per payout
 *   Cancelled tab: CancelledCard per cancelled reservation
 *
 * Filter state: URL ?filter=this-month (default) — same pattern as cashflow.
 * Tab state: URL ?tab=bookings (default).
 * Both params read server-side and passed to DB queries / client components.
 */

import { AirbnbFilterBar } from '@/components/hud/AirbnbFilterBar';
import { AirbnbPayoutCard } from '@/components/hud/AirbnbPayoutCard';
import { AirbnbTabBar } from '@/components/hud/AirbnbTabBar';
import type { AirbnbTab } from '@/components/hud/AirbnbTabBar';
import { GridOverlay } from '@/components/hud/GridOverlay';
import { HazardStripe } from '@/components/hud/HazardStripe';
import { Money } from '@/components/hud/Money';
import { requireSession } from '@/lib/auth/index';
import { resolveFilterRange } from '@/lib/cashflow-filter';
import {
  getAirbnbPreviousPeriodTotals,
  getAirbnbTotalsByRange,
  listPayoutItems,
  listPayoutsByRange,
  listReservationsByRange,
} from '@/lib/db/airbnb';
import type { AirbnbPayout, AirbnbReservation } from '@hud/db';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Extract the YYYY-MM-DD portion from a FilterRange ISO string.
 * e.g. "2026-06-01T00:00:00+08:00" → "2026-06-01"
 */
function isoToDate(isoStr: string): string {
  return isoStr.slice(0, 10);
}

const SHORT_MONTHS = [
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

/**
 * Format a DB date string as "Mon DD, YYYY".
 * DB stores ISO date "YYYY-MM-DD" for check_in; no time component.
 * If the field contains a time component (e.g. "2026-06-25T08:00:00"),
 * appends "| HHMMhrs" after the date.
 */
function formatCheckIn(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!match) return dateStr;
  const [, year, month, day, hh, mm] = match;
  const m = Number(month) - 1;
  if (m < 0 || m > 11) return dateStr;
  const datePart = `${SHORT_MONTHS[m]} ${Number(day)}, ${year}`;
  if (hh && mm) {
    return `${datePart} | ${hh}${mm}hrs`;
  }
  return datePart;
}

// ---------------------------------------------------------------------------
// % change badge
// ---------------------------------------------------------------------------

function PctBadge({ current, prior }: { current: number; prior: number }) {
  const pct = prior === 0 ? 0 : Math.round(((current - prior) / Math.abs(prior)) * 100);
  const isPositive = pct >= 0;
  const sign = isPositive ? '+' : '';
  const label = isPositive ? 'INC' : 'DEC';

  return (
    <span
      className={cn(
        'tabular font-display font-[500] uppercase',
        isPositive ? 'text-success' : 'text-destructive',
      )}
      style={{ fontSize: '12px', letterSpacing: '0.08em' }}
    >
      {sign}
      {Math.abs(pct)}% {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Booking card (Bookings tab)
// ---------------------------------------------------------------------------

function statusText(status: string): { label: string; className: string } {
  switch (status) {
    case 'paid_out':
      return { label: 'Paid Out', className: 'text-success' };
    case 'confirmed':
      return { label: 'Confirmed', className: 'text-accent' };
    case 'canceled':
      return { label: 'Cancelled', className: 'text-muted' };
    default:
      return { label: status, className: 'text-muted' };
  }
}

function BookingCard({ reservation }: { reservation: AirbnbReservation }) {
  const st = statusText(reservation.status);
  const checkInFormatted = formatCheckIn(reservation.checkIn);
  const amountMinor = reservation.realizedEarningMinor ?? reservation.projectedEarningMinor;

  return (
    <article className="border-b border-border bg-surface px-4 py-3 last:border-0">
      {/* Row 1: guest name (bold) + status (plain colored text) */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-body text-[14px] font-[600] text-foreground truncate">
          {reservation.guestName ?? '—'}
        </span>
        <span className={cn('font-body text-[13px] shrink-0', st.className)}>{st.label}</span>
      </div>

      {/* Row 2: amount (large) */}
      {amountMinor != null && (
        <div className="mt-1">
          <Money
            amountMinor={amountMinor}
            currency="PHP"
            variant="neutral"
            className="text-[20px]"
          />
        </div>
      )}

      {/* Row 3: N nights | CODE */}
      <div className="mt-1 flex items-center gap-2">
        {reservation.nights != null && (
          <span className="font-body text-[12px] text-muted">
            {reservation.nights} night{reservation.nights !== 1 ? 's' : ''}
          </span>
        )}
        {reservation.nights != null && reservation.confirmationCode && (
          <span className="font-body text-[12px] text-muted">|</span>
        )}
        <span className="font-body tabular text-[12px] text-muted">
          {reservation.confirmationCode}
        </span>
      </div>

      {/* Row 4: formatted check-in date */}
      {checkInFormatted && (
        <p className="mt-0.5 font-body tabular text-[12px] text-muted">{checkInFormatted}</p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Cancelled card (Cancelled tab)
// ---------------------------------------------------------------------------

function CancelledCard({ reservation }: { reservation: AirbnbReservation }) {
  return (
    <article className="border-b border-border bg-surface px-4 py-3 last:border-0">
      {/* Guest name (bold) */}
      <span className="font-body text-[14px] font-[600] text-foreground">
        {reservation.guestName ?? '—'}
      </span>
      {/* Confirmation code (muted) */}
      <p className="mt-0.5 font-body tabular text-[12px] text-muted">
        {reservation.confirmationCode}
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AirbnbPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireSession();
  const { userId } = ctx;

  // Resolve filter range (same pattern as cashflow page)
  const resolvedParams = await searchParams;
  const {
    from,
    to,
    priorFrom,
    priorTo,
    label: periodLabel,
    mode: activeFilter,
  } = resolveFilterRange(resolvedParams);

  // Extract YYYY-MM-DD for airbnb date-only columns (check_in, sent_date)
  const fromDate = isoToDate(from);
  const toDate = isoToDate(to);
  const priorFromDate = isoToDate(priorFrom);
  const priorToDate = isoToDate(priorTo);

  // Resolve active tab (server-side for RSC)
  const rawTab = resolvedParams.tab;
  const tabParam = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const activeTab: AirbnbTab =
    tabParam === 'payouts' || tabParam === 'cancelled' ? tabParam : 'bookings';

  // DB queries — all scoped to the filter period
  const totals = getAirbnbTotalsByRange(userId, fromDate, toDate);
  const prevTotals = getAirbnbPreviousPeriodTotals(userId, priorFromDate, priorToDate);

  const reservations = listReservationsByRange(userId, fromDate, toDate);
  const activeReservations = reservations.filter((r) => r.status !== 'canceled');
  const cancelledReservations = reservations.filter((r) => r.status === 'canceled');

  const payouts = listPayoutsByRange(userId, fromDate, toDate);

  // N total for active tab
  const tabTotal =
    activeTab === 'bookings'
      ? activeReservations.length
      : activeTab === 'payouts'
        ? payouts.length
        : cancelledReservations.length;

  return (
    <main className="relative flex-1">
      <GridOverlay />

      <div className="relative z-10 flex flex-col flex-1">
        {/* ------------------------------------------------------------------ */}
        {/* Summary card — full-width stacked                                   */}
        {/* ------------------------------------------------------------------ */}
        <section className="px-4 pt-4 pb-0">
          {/* Filter button — top right */}
          <div className="flex justify-end mb-2">
            <AirbnbFilterBar activeFilter={activeFilter} activeFilterLabel={periodLabel} />
          </div>

          <div className="border border-border bg-surface rounded-[var(--radius)]">
            {/* Projected row */}
            <div className="px-4 pt-3 pb-3 border-b border-border">
              <div className="flex items-baseline gap-3 flex-wrap">
                <Money
                  amountMinor={totals.totalProjectedMinor}
                  currency="PHP"
                  variant="neutral"
                  className="text-[22px]"
                />
                <PctBadge
                  current={totals.totalProjectedMinor}
                  prior={prevTotals.totalProjectedMinor}
                />
              </div>
              <p
                className="mt-1 font-body text-muted uppercase"
                style={{ fontSize: '11px', letterSpacing: '0.12em' }}
              >
                Projected
              </p>
            </div>

            {/* Realized row */}
            <div className="px-4 pt-3 pb-3 border-b border-border">
              <div className="flex items-baseline gap-3 flex-wrap">
                <Money
                  amountMinor={totals.totalRealizedMinor}
                  currency="PHP"
                  variant="neutral"
                  className="text-[22px]"
                />
                <PctBadge
                  current={totals.totalRealizedMinor}
                  prior={prevTotals.totalRealizedMinor}
                />
              </div>
              <p
                className="mt-1 font-body text-muted uppercase"
                style={{ fontSize: '11px', letterSpacing: '0.12em' }}
              >
                Realized
              </p>
            </div>

            {/* Status counts row */}
            <div className="px-4 py-3 flex gap-5">
              <div>
                <span className="font-display tabular text-[16px] text-accent">
                  {totals.countConfirmed}
                </span>
                <span
                  className="ml-1.5 font-body text-muted uppercase"
                  style={{ fontSize: '11px', letterSpacing: '0.1em' }}
                >
                  Confirmed
                </span>
              </div>
              <div>
                <span className="font-display tabular text-[16px] text-success">
                  {totals.countPaidOut}
                </span>
                <span
                  className="ml-1.5 font-body text-muted uppercase"
                  style={{ fontSize: '11px', letterSpacing: '0.1em' }}
                >
                  Paid Out
                </span>
              </div>
              <div>
                <span className="font-display tabular text-[16px] text-muted">
                  {totals.countCanceled}
                </span>
                <span
                  className="ml-1.5 font-body text-muted uppercase"
                  style={{ fontSize: '11px', letterSpacing: '0.1em' }}
                >
                  Cancelled
                </span>
              </div>
            </div>

            {/* HazardStripe at bottom of summary card */}
            <div className="border-t border-border">
              <HazardStripe height={14} />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Tab bar                                                             */}
        {/* ------------------------------------------------------------------ */}
        <div className="mt-4">
          <AirbnbTabBar activeTab={activeTab} />
        </div>

        {/* N total — right-aligned below tab bar */}
        <div className="flex justify-end px-4 py-1.5">
          <span className="font-body tabular text-[12px] text-muted">{tabTotal} total</span>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Tab content                                                         */}
        {/* ------------------------------------------------------------------ */}

        {/* Bookings tab */}
        {activeTab === 'bookings' && (
          <section>
            {activeReservations.length === 0 ? (
              <p className="px-4 py-6 font-body text-[14px] text-muted text-center">
                No bookings for this period.
              </p>
            ) : (
              <div>
                {activeReservations.map((r) => (
                  <BookingCard key={r.id} reservation={r} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Pay Outs tab */}
        {activeTab === 'payouts' && (
          <section>
            {payouts.length === 0 ? (
              <p className="px-4 py-6 font-body text-[14px] text-muted text-center">
                No payouts for this period.
              </p>
            ) : (
              <div>
                {payouts.map((p) => (
                  <PayoutCardWrapper key={p.id} payout={p} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Cancelled tab */}
        {activeTab === 'cancelled' && (
          <section>
            {cancelledReservations.length === 0 ? (
              <p className="px-4 py-6 font-body text-[14px] text-muted text-center">
                No cancelled reservations for this period.
              </p>
            ) : (
              <div>
                {cancelledReservations.map((r) => (
                  <CancelledCard key={r.id} reservation={r} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// PayoutCardWrapper — RSC shell that loads payout items, then passes to client
// ---------------------------------------------------------------------------

function PayoutCardWrapper({ payout }: { payout: AirbnbPayout }) {
  const items = listPayoutItems(payout.id);
  return (
    <AirbnbPayoutCard
      payoutTotalMinor={payout.payoutTotalMinor}
      bankAccountLabel={payout.bankAccountLabel}
      cashflowTransactionId={payout.cashflowTransactionId}
      items={items.map((i) => ({
        id: i.id,
        confirmationCode: i.confirmationCode,
        guestName: i.guestName,
        amountMinor: i.amountMinor,
        dateRangeStart: i.dateRangeStart,
        dateRangeEnd: i.dateRangeEnd,
      }))}
    />
  );
}
