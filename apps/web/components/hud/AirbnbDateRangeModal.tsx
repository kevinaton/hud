'use client';

/**
 * components/hud/AirbnbDateRangeModal.tsx
 *
 * Modal for the "Custom" date range filter on the Airbnb balance sheet page.
 * On Apply, navigates to /finance/airbnb?filter=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 * and preserves the active ?tab= param.
 */

import { HudDialogContent } from '@/components/hud/HudDialogContent';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import * as React from 'react';

interface AirbnbDateRangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: string;
}

export function AirbnbDateRangeModal({ open, onOpenChange, activeTab }: AirbnbDateRangeModalProps) {
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
    router.replace(
      `/finance/airbnb?filter=custom&from=${startDate}&to=${endDate}&tab=${activeTab}`,
    );
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
              htmlFor="airbnb-custom-start"
              className="font-body text-muted uppercase tracking-[0.12em] text-xs"
            >
              Start Date
            </Label>
            <Input
              id="airbnb-custom-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-[var(--radius)] border-border bg-transparent font-body text-foreground appearance-none [&::-webkit-date-and-time-value]:text-left"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="airbnb-custom-end"
              className="font-body text-muted uppercase tracking-[0.12em] text-xs"
            >
              End Date
            </Label>
            <Input
              id="airbnb-custom-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-[var(--radius)] border-border bg-transparent font-body text-foreground appearance-none [&::-webkit-date-and-time-value]:text-left"
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
