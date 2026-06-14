'use client';

/**
 * components/hud/AirbnbFilterBar.tsx
 *
 * Period filter dropdown for the Airbnb balance sheet page.
 * Identical behaviour to CashflowFilterBar but navigates to /finance/airbnb
 * and preserves the active ?tab= param so the selected tab doesn't reset.
 *
 * Button style: plain text + caret, no background — sits top-right of summary card.
 * Options: This month / 30 days / 90 days / Custom
 * Active option: text-accent.
 * Inactive options: text-muted.
 * Per hud-ui: no inline hex, CSS custom properties only.
 */

import { AirbnbDateRangeModal } from '@/components/hud/AirbnbDateRangeModal';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

type FilterMode = 'this-month' | '30d' | '90d' | 'custom';

interface FilterOption {
  label: string;
  mode: FilterMode;
}

const OPTIONS: FilterOption[] = [
  { label: 'This month', mode: 'this-month' },
  { label: '30 days', mode: '30d' },
  { label: '90 days', mode: '90d' },
  { label: 'Custom', mode: 'custom' },
];

function presetLabel(mode: FilterMode): string {
  switch (mode) {
    case 'this-month':
      return 'This month';
    case '30d':
      return '30 days';
    case '90d':
      return '90 days';
    case 'custom':
      return 'Custom';
  }
}

interface AirbnbFilterBarProps {
  /** The active filter mode resolved server-side — avoids flash before hydration. */
  activeFilter: FilterMode;
  /** The resolved display label from the server (e.g. "June 2026"). */
  activeFilterLabel: string;
}

export function AirbnbFilterBar({ activeFilter, activeFilterLabel }: AirbnbFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const rawFilter = searchParams.get('filter');
  const currentMode: FilterMode =
    rawFilter === '30d' || rawFilter === '90d' || rawFilter === 'custom'
      ? rawFilter
      : rawFilter === null
        ? activeFilter
        : 'this-month';

  const buttonLabel: string =
    currentMode === 'custom' ? activeFilterLabel : presetLabel(currentMode);

  // Preserve the active tab when changing the filter
  const activeTab = searchParams.get('tab') ?? 'bookings';

  React.useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  function handleOptionClick(mode: FilterMode) {
    setOpen(false);
    if (mode === 'custom') {
      setModalOpen(true);
      return;
    }
    router.replace(`/finance/airbnb?filter=${mode}&tab=${activeTab}`);
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'flex h-7 items-center gap-1',
            'text-muted font-body uppercase text-[11px] tracking-widest',
            'px-2',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'hover:text-foreground transition-colors',
          )}
        >
          <span>{buttonLabel}</span>
          <span aria-hidden="true" className="text-[10px] leading-none">
            ▾
          </span>
        </button>

        {open && (
          <div
            role="menu"
            aria-label="Date range filter"
            className={cn(
              'absolute right-0 top-full mt-1 z-20',
              'min-w-[10rem]',
              'border border-border bg-background rounded-sm',
              'flex flex-col py-1',
            )}
          >
            {OPTIONS.map((opt) => {
              const isActive = opt.mode === currentMode;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  role="menuitem"
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => handleOptionClick(opt.mode)}
                  className={cn(
                    'w-full text-left px-4 py-2',
                    'font-body uppercase text-[11px] tracking-widest',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    'transition-opacity hover:opacity-80',
                    isActive ? 'text-accent font-[500]' : 'text-muted',
                  )}
                >
                  {isActive && (
                    <span aria-hidden="true" className="mr-1.5">
                      ✓
                    </span>
                  )}
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AirbnbDateRangeModal open={modalOpen} onOpenChange={setModalOpen} activeTab={activeTab} />
    </>
  );
}
