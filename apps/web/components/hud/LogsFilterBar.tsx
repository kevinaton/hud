'use client';

/**
 * LogsFilterBar — status and kind filter chips for the Logs page.
 *
 * Reads/writes URL search params: ?status=pending&kind=airbnb.payout
 *
 * Per hud-ui: accent underline for active, muted for inactive, 2px radius.
 */

import { cn } from '@/lib/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Recorded', value: 'recorded' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Failed', value: 'parse_failed' },
];

const KIND_OPTIONS = [
  { label: 'All kinds', value: '' },
  { label: 'Confirmation', value: 'airbnb.reservation_confirmed' },
  { label: 'Cancellation', value: 'airbnb.cancellation' },
  { label: 'Payout', value: 'airbnb.payout' },
];

export function LogsFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get('status') ?? '';
  const currentKind = searchParams.get('kind') ?? '';

  const setFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
      {/* Status chips */}
      <div className="flex flex-wrap gap-1">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = currentStatus === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter('status', opt.value)}
              className={cn(
                'rounded-[var(--radius)] px-3 py-1 font-body text-[12px] uppercase tracking-[0.1em]',
                'border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isActive
                  ? 'border-accent text-accent'
                  : 'border-border text-muted hover:text-foreground hover:border-muted',
              )}
              aria-pressed={isActive}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Kind chips */}
      <div className="flex flex-wrap gap-1">
        {KIND_OPTIONS.map((opt) => {
          const isActive = currentKind === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter('kind', opt.value)}
              className={cn(
                'rounded-[var(--radius)] px-3 py-1 font-body text-[12px] uppercase tracking-[0.1em]',
                'border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isActive
                  ? 'border-accent text-accent'
                  : 'border-border text-muted hover:text-foreground hover:border-muted',
              )}
              aria-pressed={isActive}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
