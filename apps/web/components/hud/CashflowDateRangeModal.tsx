'use client';

/**
 * components/hud/CashflowDateRangeModal.tsx
 *
 * Modal for the "Custom" date range filter on the cashflow page.
 * On Apply, navigates to /finance/cashflow?filter=custom&from=YYYY-MM-DD&to=YYYY-MM-DD.
 */

import { HudDialogContent } from '@/components/hud/HudDialogContent';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  React.useEffect(() => {
    if (open) {
      setStartDate('');
      setEndDate('');
    }
  }, [open]);

  const orderInvalid = startDate !== '' && endDate !== '' && endDate < startDate;
  const isValid = startDate !== '' && endDate !== '' && !orderInvalid;

  function handleApply() {
    if (!isValid) return;
    onOpenChange(false);
    router.replace(`/finance/cashflow?filter=custom&from=${startDate}&to=${endDate}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <HudDialogContent>
        <DialogHeader>
          <DialogTitle className="font-body text-foreground uppercase tracking-[0.18em] text-xs font-medium">
            Custom Date Range
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="custom-start"
              className="font-body text-muted uppercase tracking-[0.12em] text-xs"
            >
              Start Date
            </Label>
            <Input
              id="custom-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-[var(--radius)] border-border bg-transparent font-body [color-scheme:dark]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="custom-end"
              className="font-body text-muted uppercase tracking-[0.12em] text-xs"
            >
              End Date
            </Label>
            <Input
              id="custom-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-[var(--radius)] border-border bg-transparent font-body [color-scheme:dark]"
            />
          </div>

          {orderInvalid && (
            <p className="font-body text-destructive text-xs" role="alert">
              End date must be on or after start date.
            </p>
          )}
        </div>

        <DialogFooter className="flex-row gap-3 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-[var(--radius)] font-body uppercase tracking-[0.12em] text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={!isValid}
            className="flex-1 rounded-[var(--radius)] bg-accent text-accent-fg font-body uppercase tracking-[0.12em] text-xs hover:bg-accent/90"
          >
            Apply
          </Button>
        </DialogFooter>
      </HudDialogContent>
    </Dialog>
  );
}
