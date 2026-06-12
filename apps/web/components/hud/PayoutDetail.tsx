'use client';

/**
 * PayoutDetail — collapsible payout item breakdown.
 *
 * Shows a list of airbnb_payout_items for a payout.
 * Per hud-ui: no shadow, surface-2 background, 2px radius.
 * Per hud-money: all amounts rendered via <Money />.
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

interface PayoutDetailProps {
  items: PayoutItem[];
  totalMinor: number;
}

export function PayoutDetail({ items, totalMinor }: PayoutDetailProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 font-body text-[12px] uppercase tracking-[0.1em] text-muted',
          'hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
        aria-expanded={open}
      >
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={cn('transition-transform', open ? 'rotate-90' : '')}
        >
          <path
            d="M4 2L8 6L4 10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {items.length} item{items.length !== 1 ? 's' : ''}
      </button>

      {open && (
        <div className="mt-2 rounded-[var(--radius)] border border-border bg-surface-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-2 border-b border-border px-3 py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="font-body text-[13px] tabular text-foreground">
                  {item.confirmationCode}
                </p>
                {item.guestName && (
                  <p className="font-body text-[12px] text-muted">{item.guestName}</p>
                )}
                {item.dateRangeStart && (
                  <p className="font-body text-[12px] tabular text-muted">
                    {item.dateRangeStart}
                    {item.dateRangeEnd ? ` – ${item.dateRangeEnd}` : ''}
                  </p>
                )}
              </div>
              <Money
                amountMinor={item.amountMinor}
                currency="PHP"
                className="shrink-0 text-[14px]"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
