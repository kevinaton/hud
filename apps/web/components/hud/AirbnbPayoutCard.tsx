'use client';

/**
 * components/hud/AirbnbPayoutCard.tsx
 *
 * Redesigned payout card for the Airbnb Pay Outs tab.
 *
 * Layout (per Figma):
 *   ┌─────────────────────────────────┐
 *   │  P49,999.67                     │  ← payout total (large, full width)
 *   ├─────────────────────────────────┤
 *   │  Kevin Aton, 4131 (PHP) 17 Items▼│  ← bank label + item count (collapsible trigger)
 *   ├─────────────────────────────────┤  (expanded)
 *   │  Stephanie Sabala   ₱1,700.73  │    guest name bold left | amount green right
 *   │  HMBDZMZMNM                     │    confirmation code muted
 *   │  Jun 25, 2026                   │    date range muted
 *   └─────────────────────────────────┘
 *
 * Per hud-money: amounts via <Money />, never inline math.
 * Per hud-ui: no inline hex, no shadow, sharp corners.
 */

import { Money } from '@/components/hud/Money';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface PayoutItem {
  id: number;
  confirmationCode: string;
  guestName: string | null;
  amountMinor: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
}

interface AirbnbPayoutCardProps {
  payoutTotalMinor: number;
  bankAccountLabel: string | null;
  cashflowTransactionId: number | null;
  items: PayoutItem[];
}

/** Format a date range string as "Mon DD, YYYY". */
function formatDateShort(dateStr: string | null): string | null {
  if (!dateStr) return null;
  // dateStr is "YYYY-MM-DD" (from DB — ISO date only, no time)
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  const MONTHS = [
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
  ];
  const m = Number(month) - 1;
  if (m < 0 || m > 11) return dateStr;
  return `${MONTHS[m]} ${Number(day)}, ${year}`;
}

export function AirbnbPayoutCard({
  payoutTotalMinor,
  bankAccountLabel,
  cashflowTransactionId,
  items,
}: AirbnbPayoutCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <article className="border-b border-border bg-surface last:border-0">
      {/* Payout total — dominant element */}
      <div className="px-4 pt-3 pb-2">
        <Money
          amountMinor={payoutTotalMinor}
          currency="PHP"
          variant="neutral"
          className="text-[22px]"
        />
        {cashflowTransactionId != null && (
          <p className="mt-1 font-body text-[11px] uppercase tracking-[0.1em] text-success">
            Posted to cashflow
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Bank label + item count — collapsible trigger */}
      {(bankAccountLabel || items.length > 0) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            'w-full flex items-center justify-between px-4 py-2.5',
            'font-body text-[12px] text-muted',
            'hover:text-foreground transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
        >
          <span className="truncate">{bankAccountLabel ?? 'Bank account'}</span>
          <span className="shrink-0 ml-2 flex items-center gap-1 font-body text-[12px] text-muted">
            {items.length} Item{items.length !== 1 ? 's' : ''}
            <span
              aria-hidden="true"
              className={cn('text-[10px] transition-transform', open ? 'rotate-180' : '')}
            >
              ▼
            </span>
          </span>
        </button>
      )}

      {/* Expanded items */}
      {open && items.length > 0 && (
        <div className="border-t border-border bg-surface-2">
          {items.map((item) => {
            const dateLabel = formatDateShort(item.dateRangeStart);
            return (
              <div key={item.id} className="border-b border-border px-4 py-2.5 last:border-0">
                {/* Guest name + amount */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-body text-[14px] font-[600] text-foreground truncate">
                    {item.guestName ?? '—'}
                  </span>
                  <Money
                    amountMinor={item.amountMinor}
                    currency="PHP"
                    className="shrink-0 text-[14px] text-success"
                  />
                </div>
                {/* Confirmation code */}
                <p className="font-body text-[12px] text-muted tabular">{item.confirmationCode}</p>
                {/* Date */}
                {dateLabel && (
                  <p className="font-body text-[12px] text-muted tabular">{dateLabel}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
