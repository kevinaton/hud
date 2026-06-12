'use client';

/**
 * components/hud/CashflowFilterBar.tsx
 *
 * Single accent dropdown button showing the active filter label.
 *
 * Layout (in TRANSACTIONS header row):
 *   TRANSACTIONS        [This month ▾]  [+]
 *
 * Button style:
 *   bg-accent text-accent-fg font-body uppercase text-[11px] tracking-widest
 *   px-3 py-1 rounded-sm — matches [+] button aesthetic
 *
 * Dropdown panel:
 *   absolute, border border-border, bg-background, rounded-sm, z-20
 *   No box-shadow (per hud-ui skill)
 *
 * Options: This month / 30 days / 90 days / Custom
 *   Active: text-accent font-[500]
 *   Inactive: text-muted
 *
 * Click-outside closes the dropdown via useRef + useEffect mousedown listener.
 * "Custom" closes dropdown + opens CashflowDateRangeModal.
 *
 * Per hud-ui skill: no inline hex, CSS custom properties only.
 */

import { CashflowDateRangeModal } from '@/components/hud/CashflowDateRangeModal';
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

/** Map a preset FilterMode to its fixed display label. */
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

interface CashflowFilterBarProps {
  /** The active filter mode resolved server-side — used as the initial value to
   *  avoid a flash before useSearchParams hydrates. */
  activeFilter: FilterMode;
  /** The resolved display label from the server (e.g. "June 2026", "Apr 1 – Jun 12, 2026").
   *  Used as the button label on first paint and for custom ranges after hydration. */
  activeFilterLabel: string;
}

export function CashflowFilterBar({ activeFilter, activeFilterLabel }: CashflowFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Derive current mode from URL params (client-authoritative after hydration).
  // Falls back to the server-resolved activeFilter before searchParams is available.
  const rawFilter = searchParams.get('filter');
  const currentMode: FilterMode =
    rawFilter === '30d' || rawFilter === '90d' || rawFilter === 'custom'
      ? rawFilter
      : rawFilter === null
        ? activeFilter
        : 'this-month';

  // For custom mode the label must come from the server prop (it encodes from/to).
  // For preset modes derive the label from currentMode.
  const buttonLabel: string =
    currentMode === 'custom' ? activeFilterLabel : presetLabel(currentMode);

  // Click-outside handler — closes the dropdown
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
    router.replace(`/finance/cashflow?filter=${mode}`);
  }

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Dropdown trigger + panel                                            */}
      {/* ------------------------------------------------------------------ */}
      <div ref={containerRef} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'flex items-center gap-1.5',
            'bg-accent text-accent-fg font-body uppercase text-[11px] tracking-widest',
            'px-3 py-1 rounded-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'transition-opacity hover:opacity-80 active:opacity-70',
          )}
        >
          <span>{buttonLabel}</span>
          {/* Down-caret indicator */}
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

      {/* ------------------------------------------------------------------ */}
      {/* Custom date range modal                                             */}
      {/* ------------------------------------------------------------------ */}
      <CashflowDateRangeModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
