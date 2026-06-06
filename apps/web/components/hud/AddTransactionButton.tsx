'use client';

/**
 * components/hud/AddTransactionButton.tsx
 *
 * The [+] button that opens the TransactionModal for creating a new transaction.
 *
 * Per hud-ui skill: bg-accent text-accent-fg, 2px radius, no inline hex.
 *
 * Note: For the cashflow page, which needs both add and edit mode in a single
 * modal, use CashflowTransactionSection instead.
 */

import { TransactionModal } from '@/components/hud/TransactionModal';
import { cn } from '@/lib/utils';
import * as React from 'react';

interface Category {
  id: number;
  name: string;
}

interface AddTransactionButtonProps {
  categories: Category[];
}

export function AddTransactionButton({ categories }: AddTransactionButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Add transaction"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-7 w-7 items-center justify-center',
          'bg-accent text-accent-fg font-display text-[16px] font-[500]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'transition-opacity hover:opacity-80 active:opacity-70',
        )}
      >
        +
      </button>

      <TransactionModal open={open} onOpenChange={setOpen} categories={categories} />
    </>
  );
}
