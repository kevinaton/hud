'use client';

/**
 * components/hud/CashflowFilterBar.tsx
 *
 * Four pill buttons: "This month" | "30 days" | "90 days" | "Custom"
 *
 * Active pill:   bg-accent text-accent-fg (filled cyan)
 * Inactive pill: border border-border text-muted bg-transparent
 *
 * Pill style (per ticket spec):
 *   font-body uppercase text-[11px] tracking-widest px-3 py-1
 *   rounded-sm (2px radius — matches --radius)
 *   No box-shadow
 *
 * "Custom" click → opens CashflowDateRangeModal (co-located state).
 * All others → router.replace to the appropriate ?filter= URL.
 *
 * Per hud-ui skill: no inline hex, CSS custom properties only.
 */

import { CashflowDateRangeModal } from '@/components/hud/CashflowDateRangeModal';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

type FilterMode = 'this-month' | '30d' | '90d' | 'custom';

interface FilterPill {
  label: string;
  mode: FilterMode;
}

const PILLS: FilterPill[] = [
  { label: 'This month', mode: 'this-month' },
  { label: '30 days', mode: '30d' },
  { label: '90 days', mode: '90d' },
  { label: 'Custom', mode: 'custom' },
];

interface CashflowFilterBarProps {
  /** The active filter mode resolved server-side — used as the initial value to
   *  avoid a flash before useSearchParams hydrates. */
  activeFilter: FilterMode;
}

export function CashflowFilterBar({ activeFilter }: CashflowFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen] = React.useState(false);

  // Derive current mode from URL params (client-authoritative after hydration).
  // Falls back to the server-resolved activeFilter on first render.
  const rawFilter = searchParams.get('filter');
  const currentMode: FilterMode =
    rawFilter === '30d' || rawFilter === '90d' || rawFilter === 'custom' ? rawFilter : 'this-month';

  function handlePillClick(mode: FilterMode) {
    if (mode === 'custom') {
      setModalOpen(true);
      return;
    }
    router.replace(`/finance/cashflow?filter=${mode}`);
  }

  return (
    <>
      <fieldset className="flex flex-wrap gap-2 py-3 border-0 p-0 m-0">
        <legend className="sr-only">Date range filter</legend>
        {PILLS.map((pill) => {
          const isActive =
            pill.mode === currentMode ||
            // Treat server-resolved activeFilter as authoritative on first render
            (rawFilter === null && pill.mode === activeFilter && pill.mode === 'this-month');

          return (
            <button
              key={pill.mode}
              type="button"
              aria-pressed={isActive}
              onClick={() => handlePillClick(pill.mode)}
              className={cn(
                'font-body uppercase text-[11px] tracking-widest px-3 py-1',
                'rounded-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'transition-opacity',
                isActive
                  ? 'bg-accent text-accent-fg'
                  : 'border border-border text-muted bg-transparent hover:opacity-80 active:opacity-70',
              )}
            >
              {pill.label}
            </button>
          );
        })}
      </fieldset>

      <CashflowDateRangeModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
