'use client';

/**
 * components/hud/CashflowTransactionSection.tsx
 *
 * Client component for the "TRANSACTIONS" section on the cashflow page.
 *
 * Owns:
 *   - The [+] add button (opens modal in create mode)
 *   - The transaction row list (each row is clickable — opens modal in edit mode)
 *   - The TransactionModal (shared for both create and edit)
 *
 * A single modal instance handles both modes to avoid duplicated dialog
 * state and animation conflicts.
 *
 * The Server Component parent (cashflow/page.tsx) passes:
 *   - `categories` from the DB
 *   - `transactions` from the DB (current month)
 *
 * After a successful save/delete, router.refresh() re-fetches server data
 * (handled inside TransactionModal).
 *
 * Per hud-ui skill: no inline hex, no box-shadow, 2px radius.
 */

import { CashflowFilterBar } from '@/components/hud/CashflowFilterBar';
import { TransactionModal } from '@/components/hud/TransactionModal';
import type { TransactionForEdit } from '@/components/hud/TransactionModal';
import { TransactionRow } from '@/components/hud/TransactionRow';
import type { TransactionDisplay } from '@/components/hud/TransactionRow';
import { cn } from '@/lib/utils';
import * as React from 'react';

interface Category {
  id: number;
  name: string;
}

export interface TransactionRowData extends TransactionDisplay {
  notes?: string | null;
}

type FilterMode = 'this-month' | '30d' | '90d' | 'custom';

interface CashflowTransactionSectionProps {
  categories: Category[];
  transactions: TransactionRowData[];
  /** The active filter mode resolved server-side, passed through for the filter bar. */
  activeFilter: FilterMode;
}

export function CashflowTransactionSection({
  categories,
  transactions,
  activeFilter,
}: CashflowTransactionSectionProps) {
  const [open, setOpen] = React.useState(false);
  const [editingTx, setEditingTx] = React.useState<TransactionForEdit | undefined>(undefined);

  function handleAddClick() {
    setEditingTx(undefined);
    setOpen(true);
  }

  function handleRowClick(tx: TransactionRowData) {
    setEditingTx({
      id: typeof tx.id === 'number' ? tx.id : Number(tx.id),
      item: tx.item,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      occurredAt: tx.occurredAt,
      category: tx.category,
      notes: tx.notes ?? null,
    });
    setOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setEditingTx(undefined);
  }

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Header row: "TRANSACTIONS" label + [+] button                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex items-center justify-between py-4">
        <h2
          className="font-body text-muted uppercase"
          style={{ fontSize: '12px', letterSpacing: '0.18em', fontWeight: 500 }}
        >
          Transactions
        </h2>
        <button
          type="button"
          aria-label="Add transaction"
          onClick={handleAddClick}
          className={cn(
            'flex h-7 w-7 items-center justify-center',
            'bg-accent text-accent-fg font-display text-[16px] font-[500]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'transition-opacity hover:opacity-80 active:opacity-70',
          )}
        >
          +
        </button>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Filter chips — "This month" | "30 days" | "90 days" | "Custom"  */}
      {/* ---------------------------------------------------------------- */}
      <CashflowFilterBar activeFilter={activeFilter} />

      {/* ---------------------------------------------------------------- */}
      {/* Transaction list                                                 */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col flex-1 pb-8 border border-border">
        {transactions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <p
              className="font-body text-muted uppercase"
              style={{ fontSize: '12px', letterSpacing: '0.18em' }}
            >
              No transactions for this period
            </p>
          </div>
        ) : (
          transactions.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} onClick={() => handleRowClick(tx)} />
          ))
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Unified modal (create + edit)                                    */}
      {/* ---------------------------------------------------------------- */}
      <TransactionModal
        open={open}
        onOpenChange={handleOpenChange}
        categories={categories}
        transaction={editingTx}
      />
    </>
  );
}
