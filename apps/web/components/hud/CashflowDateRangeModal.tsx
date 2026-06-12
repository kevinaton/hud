'use client';

/**
 * components/hud/CashflowDateRangeModal.tsx
 *
 * Modal for the "Custom" date range filter on the cashflow page.
 *
 * Two <input type="date"> fields (start / end). On Apply, navigates to:
 *   /finance/cashflow?filter=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Per hud-ui skill:
 *   - bg-surface, border-border, no box-shadow, 2px radius
 *   - Oxanium (font-body) for labels, Orbitron (font-display) for numeric inputs
 *   - No inline hex — CSS custom properties only
 *
 * Validation:
 *   - Both dates required
 *   - end must be >= start
 *   - Apply disabled while invalid
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import * as React from 'react';

interface CashflowDateRangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CashflowDateRangeModal({ open, onOpenChange }: CashflowDateRangeModalProps) {
  const router = useRouter();

  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');

  // Validation
  const startMissing = startDate === '';
  const endMissing = endDate === '';
  const orderInvalid = !startMissing && !endMissing && endDate < startDate;
  const isValid = !startMissing && !endMissing && !orderInvalid;

  // Reset fields when the modal opens fresh
  React.useEffect(() => {
    if (open) {
      setStartDate('');
      setEndDate('');
    }
  }, [open]);

  function handleApply() {
    if (!isValid) return;
    onOpenChange(false);
    router.replace(`/finance/cashflow?filter=custom&from=${startDate}&to=${endDate}`);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  const errorMessage: string | null = orderInvalid
    ? 'End date must be on or after start date.'
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'bg-surface border border-border',
          'rounded-[var(--radius)]',
          // Override any shadow from the shadcn default
          'shadow-none',
          'max-w-sm w-full',
        )}
      >
        <DialogHeader>
          <DialogTitle
            className="font-body text-foreground uppercase"
            style={{ fontSize: '12px', letterSpacing: '0.18em', fontWeight: 500 }}
          >
            Custom Date Range
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          {/* Start date */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="custom-start"
              className="font-body text-muted uppercase"
              style={{ fontSize: '11px', letterSpacing: '0.12em' }}
            >
              Start Date
            </label>
            <input
              id="custom-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={cn(
                'w-full bg-transparent border border-border text-foreground font-body',
                'px-3 py-2 rounded-[var(--radius)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                // Ensure calendar picker icon inherits foreground color
                '[color-scheme:dark]',
              )}
              style={{ fontSize: '14px' }}
            />
          </div>

          {/* End date */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="custom-end"
              className="font-body text-muted uppercase"
              style={{ fontSize: '11px', letterSpacing: '0.12em' }}
            >
              End Date
            </label>
            <input
              id="custom-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={cn(
                'w-full bg-transparent border border-border text-foreground font-body',
                'px-3 py-2 rounded-[var(--radius)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                '[color-scheme:dark]',
              )}
              style={{ fontSize: '14px' }}
            />
          </div>

          {/* Inline error */}
          {errorMessage !== null && (
            <p className="font-body text-destructive" role="alert" style={{ fontSize: '12px' }}>
              {errorMessage}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              className={cn(
                'flex-1 px-3 py-2 border border-border text-muted font-body uppercase',
                'rounded-[var(--radius)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'transition-opacity hover:opacity-80 active:opacity-70',
              )}
              style={{ fontSize: '11px', letterSpacing: '0.12em' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!isValid}
              aria-disabled={!isValid}
              className={cn(
                'flex-1 px-3 py-2 font-body uppercase',
                'rounded-[var(--radius)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'transition-opacity',
                isValid
                  ? 'bg-accent text-accent-fg hover:opacity-80 active:opacity-70'
                  : 'bg-surface-2 text-muted cursor-not-allowed opacity-50',
              )}
              style={{ fontSize: '11px', letterSpacing: '0.12em' }}
            >
              Apply
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
