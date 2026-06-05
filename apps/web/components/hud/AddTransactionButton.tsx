'use client';

/**
 * components/hud/AddTransactionButton.tsx
 *
 * The [+] button that opens the AddTransactionModal on the cashflow page.
 *
 * This is a client component because it manages the modal's open/close state
 * and calls router.refresh() after a successful add (via AddTransactionModal's
 * onSuccess callback, which itself calls router.refresh() internally).
 *
 * The categories list is passed as a prop from the Server Component parent
 * (cashflow page.tsx), so no client-side fetch is needed.
 *
 * Per hud-ui skill: bg-accent text-accent-fg, 2px radius, no inline hex.
 */

import { AddTransactionModal } from '@/components/hud/AddTransactionModal';
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

      <AddTransactionModal open={open} onOpenChange={setOpen} categories={categories} />
    </>
  );
}
