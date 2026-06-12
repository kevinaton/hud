/**
 * app/(app)/airbnb/page.tsx
 *
 * Airbnb balance sheet — React Server Component (read-only).
 *
 * Sections:
 *   1. Summary totals — projected / realized / counts by status
 *   2. Bookings list — each reservation with status badge, projected vs realized
 *   3. Payout history — each payout with collapsible item detail
 *
 * All money displayed via <Money />. All amounts are centavo integers from DB.
 * Canceled bookings excluded from earnings totals.
 *
 * Per hud-ui: no box-shadow, 2px radius, surface/surface-2 cards.
 * Per hud-money: no manual formattering — <Money> only.
 */

import { GridOverlay } from '@/components/hud/GridOverlay';
import { HazardStripe } from '@/components/hud/HazardStripe';
import { Money } from '@/components/hud/Money';
import { PayoutDetail } from '@/components/hud/PayoutDetail';
import { requireSession } from '@/lib/auth/index';
import { getAirbnbTotals, listPayoutItems, listPayouts, listReservations } from '@/lib/db/airbnb';
import type { AirbnbPayout, AirbnbReservation } from '@hud/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  const classMap: Record<string, string> = {
    confirmed: 'text-accent border-accent',
    canceled: 'text-muted border-muted',
    paid_out: 'text-success border-success',
  };
  const cls = classMap[status] ?? 'text-muted border-muted';
  return (
    <span
      className={`inline-block rounded-[var(--radius)] border px-2 py-0.5 font-body text-[11px] uppercase tracking-[0.1em] ${cls}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Booking row
// ---------------------------------------------------------------------------
function BookingRow({ reservation }: { reservation: AirbnbReservation }) {
  const isCanceled = reservation.status === 'canceled';

  return (
    <article
      className={`border-b border-border px-4 py-3 last:border-0 ${isCanceled ? 'opacity-60' : ''}`}
    >
      {/* Header row: code + status + dates */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-body tabular text-[13px] font-[500] text-foreground">
            {reservation.confirmationCode}
          </span>
          {statusBadge(reservation.status)}
        </div>
        {reservation.checkIn && (
          <time className="font-body tabular text-[12px] text-muted shrink-0">
            {reservation.checkIn}
            {reservation.checkOut ? ` – ${reservation.checkOut}` : ''}
          </time>
        )}
      </div>

      {/* Guest + nights */}
      <div className="mt-0.5 flex flex-wrap gap-2">
        {reservation.guestName && (
          <span className="font-body text-[13px] text-muted">{reservation.guestName}</span>
        )}
        {reservation.nights != null && (
          <span className="font-body text-[12px] text-muted">
            {reservation.nights} night{reservation.nights !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Earnings — projected vs realized */}
      {!isCanceled && (
        <div className="mt-2 flex flex-wrap gap-4">
          {reservation.projectedEarningMinor != null && (
            <div>
              <p className="font-body text-[11px] uppercase tracking-[0.1em] text-muted">
                Forecast
              </p>
              <Money
                amountMinor={reservation.projectedEarningMinor}
                currency="PHP"
                variant="neutral"
                className="text-[14px]"
              />
            </div>
          )}
          {reservation.realizedEarningMinor != null && (
            <div>
              <p className="font-body text-[11px] uppercase tracking-[0.1em] text-muted">
                Realized
              </p>
              <Money
                amountMinor={reservation.realizedEarningMinor}
                currency="PHP"
                className="text-[14px]"
              />
            </div>
          )}
        </div>
      )}

      {isCanceled && (
        <p className="mt-1 font-body text-[12px] uppercase tracking-[0.1em] text-muted">
          Canceled — excluded from totals
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Payout row (with fetched items)
// ---------------------------------------------------------------------------
function PayoutRow({ payout }: { payout: AirbnbPayout }) {
  const items = listPayoutItems(payout.id);

  return (
    <article className="border-b border-border px-4 py-3 last:border-0">
      {/* Top row: total + date */}
      <div className="flex items-start justify-between gap-2">
        <Money amountMinor={payout.payoutTotalMinor} currency="PHP" className="text-[18px]" />
        {payout.sentDate && (
          <time className="font-body tabular text-[12px] text-muted shrink-0">
            {payout.sentDate}
          </time>
        )}
      </div>

      {/* Bank label */}
      {payout.bankAccountLabel && (
        <p className="mt-0.5 font-body text-[12px] text-muted">→ {payout.bankAccountLabel}</p>
      )}

      {/* Expected arrival */}
      {payout.expectedArrivalDate && (
        <p className="font-body text-[12px] text-muted">
          Expected: <span className="tabular text-foreground">{payout.expectedArrivalDate}</span>
        </p>
      )}

      {/* Cashflow link indicator */}
      {payout.cashflowTransactionId != null && (
        <p className="mt-1 font-body text-[11px] uppercase tracking-[0.1em] text-success">
          Posted to cashflow
        </p>
      )}

      {/* Collapsible item detail */}
      {items.length > 0 && (
        <PayoutDetail
          items={items.map((i) => ({
            id: i.id,
            confirmationCode: i.confirmationCode,
            guestName: i.guestName,
            amountMinor: i.amountMinor,
            dateRangeStart: i.dateRangeStart,
            dateRangeEnd: i.dateRangeEnd,
          }))}
          totalMinor={payout.payoutTotalMinor}
        />
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AirbnbPage() {
  const ctx = await requireSession();
  const { userId } = ctx;

  const reservations = listReservations(userId);
  const payouts = listPayouts(userId);
  const totals = getAirbnbTotals(userId);

  const activeReservations = reservations.filter((r) => r.status !== 'canceled');
  const canceledReservations = reservations.filter((r) => r.status === 'canceled');

  return (
    <main className="relative flex-1">
      <GridOverlay />

      {/* Summary totals */}
      <section className="px-4 py-4">
        <h2 className="mb-3 font-body text-[12px] uppercase tracking-[0.18em] text-muted">
          Summary
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[var(--radius)] border border-border bg-surface px-4 py-3">
            <p className="font-body text-[11px] uppercase tracking-[0.1em] text-muted">Projected</p>
            <Money
              amountMinor={totals.totalProjectedMinor}
              currency="PHP"
              variant="neutral"
              className="text-[22px]"
            />
          </div>
          <div className="rounded-[var(--radius)] border border-border bg-surface px-4 py-3">
            <p className="font-body text-[11px] uppercase tracking-[0.1em] text-muted">Realized</p>
            <Money amountMinor={totals.totalRealizedMinor} currency="PHP" className="text-[22px]" />
          </div>
        </div>

        {/* Status counts */}
        <div className="mt-3 flex gap-4">
          <div className="text-center">
            <p className="font-display tabular text-[20px] text-accent">{totals.countConfirmed}</p>
            <p className="font-body text-[11px] uppercase tracking-[0.1em] text-muted">Confirmed</p>
          </div>
          <div className="text-center">
            <p className="font-display tabular text-[20px] text-success">{totals.countPaidOut}</p>
            <p className="font-body text-[11px] uppercase tracking-[0.1em] text-muted">Paid Out</p>
          </div>
          <div className="text-center">
            <p className="font-display tabular text-[20px] text-muted">{totals.countCanceled}</p>
            <p className="font-body text-[11px] uppercase tracking-[0.1em] text-muted">Canceled</p>
          </div>
        </div>
      </section>

      <HazardStripe />

      {/* Bookings list */}
      <section>
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="font-body text-[12px] uppercase tracking-[0.18em] text-muted">Bookings</h2>
          <span className="font-body tabular text-[12px] text-muted">
            {activeReservations.length}
          </span>
        </div>

        {activeReservations.length === 0 ? (
          <p className="px-4 py-6 font-body text-[14px] text-muted text-center">No bookings yet.</p>
        ) : (
          <div className="bg-surface">
            {activeReservations.map((r) => (
              <BookingRow key={r.id} reservation={r} />
            ))}
          </div>
        )}

        {/* Canceled bookings (collapsed section) */}
        {canceledReservations.length > 0 && (
          <div className="bg-surface">
            <div className="border-t border-border px-4 py-2">
              <span className="font-body text-[12px] uppercase tracking-[0.18em] text-muted">
                Canceled ({canceledReservations.length})
              </span>
            </div>
            {canceledReservations.map((r) => (
              <BookingRow key={r.id} reservation={r} />
            ))}
          </div>
        )}
      </section>

      <HazardStripe />

      {/* Payout history */}
      <section>
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="font-body text-[12px] uppercase tracking-[0.18em] text-muted">Payouts</h2>
          <span className="font-body tabular text-[12px] text-muted">{payouts.length}</span>
        </div>

        {payouts.length === 0 ? (
          <p className="px-4 py-6 font-body text-[14px] text-muted text-center">
            No payouts recorded yet.
          </p>
        ) : (
          <div className="bg-surface">
            {payouts.map((p) => (
              <PayoutRow key={p.id} payout={p} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
