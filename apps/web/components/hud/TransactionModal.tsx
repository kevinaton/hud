'use client';

/**
 * components/hud/TransactionModal.tsx
 *
 * Unified modal for both creating and editing a transaction.
 *
 * - Create mode: no `transaction` prop. Title = "Add Transaction", submit = "Add".
 * - Edit mode:   `transaction` prop present. Title = "Edit Transaction",
 *                submit = "Save Changes", delete button at lower left.
 *
 * Edit mode:
 *   - Fields are pre-populated from `transaction`.
 *   - Submit calls PUT /api/transactions/[id].
 *   - Delete button shows an inline confirmation step before calling
 *     DELETE /api/transactions/[id].
 *
 * Per hud-ui skill:
 *   - Oxanium body/labels, Orbitron amount input.
 *   - 2px radius, cyan focus rings, no inline hex, no box-shadow.
 *   - Cyberpunk dark surfaces (bg-surface, bg-surface-2).
 *
 * Per hud-money skill:
 *   - `amount` is submitted as a number (decimal).
 *   - Server converts it to minor units via Math.round(amount * 100).
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { CategoryCombobox } from '@/components/hud/CategoryCombobox';
import { HudDialogContent } from '@/components/hud/HudDialogContent';
import { Button } from '@/components/ui/button';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { type CreateTransactionInput, createTransactionSchema } from '@/lib/validators/transaction';

interface Category {
  id: number;
  name: string;
}

/**
 * The minimum transaction data needed to pre-populate edit mode.
 * Passed from TransactionRow (via cashflow page) when a row is clicked.
 */
export interface TransactionForEdit {
  id: number;
  item: string;
  /** Signed integer minor units */
  amountMinor: number;
  currency: string;
  /** ISO-8601 string, e.g. "2026-06-24T00:00:00+08:00" */
  occurredAt: string;
  category?: string;
  notes?: string | null;
}

interface TransactionModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Called to close the modal. */
  onOpenChange: (open: boolean) => void;
  /** Available categories to populate the combobox. */
  categories: Category[];
  /**
   * When present, the modal opens in edit mode, pre-populated with this data.
   * When absent (undefined), the modal opens in create mode.
   */
  transaction?: TransactionForEdit;
}

// ---------------------------------------------------------------------------
// Module-level pure helpers (no component state closures)
// ---------------------------------------------------------------------------

/** ISO date string for today in Asia/Manila time (YYYY-MM-DD). */
function getTodayManila(): string {
  const nowUtc = new Date();
  const offsetMs = 8 * 60 * 60 * 1000;
  const manila = new Date(nowUtc.getTime() + offsetMs);
  const y = manila.getUTCFullYear();
  const m = String(manila.getUTCMonth() + 1).padStart(2, '0');
  const d = String(manila.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Extract YYYY-MM-DD from an ISO-8601 string. Uses string prefix — avoids TZ ambiguity. */
function isoToDateInput(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Convert amountMinor (signed integer centavos) to a decimal number suitable for the
 * amount input (e.g. -28000 → -280).
 */
function minorToDecimal(minor: number): number {
  return minor / 100;
}

/** Read the CSRF token from the hud_csrf cookie. */
function readCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const cookieName = 'hud_csrf';
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${cookieName}=`));
  return match ? match.split('=')[1] : '';
}

/** Build the JSON body sent to the API for create or edit. */
function buildPayload(data: CreateTransactionInput): string {
  return JSON.stringify({
    item: data.item,
    amount: data.amount,
    date: data.date,
    categoryName: data.categoryName || null,
    notes: data.notes || null,
  });
}

/**
 * POST /api/transactions (create mode).
 * Returns true on success; calls onError with a user-facing message on failure.
 */
async function apiCreate(
  data: CreateTransactionInput,
  csrfToken: string,
  onError: (msg: string) => void,
): Promise<boolean> {
  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: buildPayload(data),
  });
  if (res.ok) return true;
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  onError(json.error ?? 'An unexpected error occurred. Please try again.');
  return false;
}

/**
 * PUT /api/transactions/[id] (edit mode).
 * Returns true on success; calls onError with a user-facing message on failure.
 */
async function apiUpdate(
  txId: number,
  data: CreateTransactionInput,
  csrfToken: string,
  onError: (msg: string) => void,
): Promise<boolean> {
  const res = await fetch(`/api/transactions/${txId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: buildPayload(data),
  });
  if (res.ok) return true;
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  onError(json.error ?? 'An unexpected error occurred. Please try again.');
  return false;
}

/**
 * DELETE /api/transactions/[id].
 * Returns true on success; calls onError with a user-facing message on failure.
 */
async function apiDelete(
  txId: number,
  csrfToken: string,
  onError: (msg: string) => void,
): Promise<boolean> {
  const res = await fetch(`/api/transactions/${txId}`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  });
  if (res.ok || res.status === 204) return true;
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  onError(json.error ?? 'Delete failed. Please try again.');
  return false;
}

// ---------------------------------------------------------------------------
// DeleteControls sub-component
// Renders the delete button (idle) or inline confirm (confirm/deleting) state.
// Extracted to reduce complexity of the main component.
// ---------------------------------------------------------------------------
interface DeleteControlsProps {
  deleteState: 'idle' | 'confirm' | 'deleting';
  isDeleting: boolean;
  disabled: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function DeleteControls({
  deleteState,
  isDeleting,
  disabled,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: DeleteControlsProps) {
  if (deleteState === 'idle') {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={onRequestDelete}
        disabled={disabled}
        className={cn(
          'rounded-[var(--radius)]',
          'font-body uppercase tracking-[0.12em] text-xs',
          'text-destructive hover:text-destructive hover:bg-destructive/10',
        )}
      >
        Delete
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="font-body text-destructive uppercase"
        style={{ fontSize: '11px', letterSpacing: '0.1em' }}
      >
        Confirm?
      </span>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancelDelete}
        disabled={isDeleting}
        className={cn(
          'h-7 px-2 rounded-[var(--radius)]',
          'font-body uppercase tracking-[0.12em] text-xs text-muted',
          'hover:text-foreground hover:bg-surface-2',
        )}
      >
        No
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onConfirmDelete}
        disabled={isDeleting}
        className={cn(
          'h-7 px-2 rounded-[var(--radius)]',
          'font-body uppercase tracking-[0.12em] text-xs',
          'text-destructive hover:text-destructive hover:bg-destructive/10',
        )}
      >
        {isDeleting ? 'Deleting...' : 'Yes, Delete'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TransactionModal
// ---------------------------------------------------------------------------

export function TransactionModal({
  open,
  onOpenChange,
  categories,
  transaction,
}: TransactionModalProps) {
  const router = useRouter();
  const isEdit = transaction !== undefined;

  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [deleteState, setDeleteState] = React.useState<'idle' | 'confirm' | 'deleting'>('idle');
  const isDeleting = deleteState === 'deleting';

  const buildDefaults = React.useCallback((): CreateTransactionInput => {
    if (isEdit && transaction) {
      return {
        item: transaction.item,
        amount: minorToDecimal(transaction.amountMinor),
        date: isoToDateInput(transaction.occurredAt),
        categoryName: transaction.category ?? '',
        notes: transaction.notes ?? '',
      };
    }
    return {
      item: '',
      amount: undefined as unknown as number,
      date: getTodayManila(),
      categoryName: '',
      notes: '',
    };
  }, [isEdit, transaction]);

  const form = useForm<CreateTransactionInput>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: buildDefaults(),
  });

  React.useEffect(() => {
    if (open) {
      form.reset(buildDefaults());
      setServerError(null);
      setDeleteState('idle');
    }
  }, [open, buildDefaults, form]);

  async function onSubmit(data: CreateTransactionInput) {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const csrfToken = readCsrfCookie();
      const ok =
        isEdit && transaction
          ? await apiUpdate(transaction.id, data, csrfToken, setServerError)
          : await apiCreate(data, csrfToken, setServerError);
      if (ok) {
        onOpenChange(false);
        router.refresh();
      }
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!transaction) return;
    setDeleteState('deleting');
    setServerError(null);
    try {
      const ok = await apiDelete(transaction.id, readCsrfCookie(), setServerError);
      if (ok) {
        onOpenChange(false);
        router.refresh();
      } else {
        setDeleteState('idle');
      }
    } catch {
      setServerError('Network error. Please check your connection and try again.');
      setDeleteState('idle');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <HudDialogContent>
        <DialogHeader>
          <DialogTitle
            className="font-body text-foreground uppercase tracking-[0.18em]"
            style={{ fontSize: '12px', fontWeight: 500 }}
          >
            {isEdit ? 'Edit Transaction' : 'Add Transaction'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2">
            {/* Item */}
            <FormField
              control={form.control}
              name="item"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-body text-muted uppercase tracking-[0.12em] text-xs">
                    Item
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Grocery, Jeep fare"
                      {...field}
                      className={cn(
                        'rounded-[var(--radius)] border-border bg-transparent',
                        'font-body text-sm text-foreground placeholder:text-muted',
                        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      )}
                    />
                  </FormControl>
                  <FormMessage className="font-body text-xs" />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-body text-muted uppercase tracking-[0.12em] text-xs">
                    Amount
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="e.g. -280.00 or 5000"
                      {...field}
                      value={
                        field.value === undefined || (field.value as unknown) === ''
                          ? ''
                          : field.value
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '' || raw === '-') {
                          field.onChange(raw === '' ? undefined : raw);
                        } else {
                          const parsed = Number.parseFloat(raw);
                          field.onChange(Number.isNaN(parsed) ? undefined : parsed);
                        }
                      }}
                      className={cn(
                        'rounded-[var(--radius)] border-border bg-transparent',
                        'font-display tabular text-foreground placeholder:text-muted placeholder:font-body',
                        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      )}
                    />
                  </FormControl>
                  <FormMessage className="font-body text-xs" />
                </FormItem>
              )}
            />

            {/* Date */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-body text-muted uppercase tracking-[0.12em] text-xs">
                    Date
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      className={cn(
                        'rounded-[var(--radius)] border-border bg-transparent',
                        'font-display tabular text-foreground',
                        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      )}
                    />
                  </FormControl>
                  <FormMessage className="font-body text-xs" />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name="categoryName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-body text-muted uppercase tracking-[0.12em] text-xs">
                    Category
                  </FormLabel>
                  <FormControl>
                    <CategoryCombobox
                      id={field.name}
                      categories={categories}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage className="font-body text-xs" />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-body text-muted uppercase tracking-[0.12em] text-xs">
                    Notes <span className="normal-case">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional memo..."
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                      className={cn(
                        'rounded-[var(--radius)] border-border bg-transparent resize-none',
                        'font-body text-sm text-foreground placeholder:text-muted',
                        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      )}
                    />
                  </FormControl>
                  <FormMessage className="font-body text-xs" />
                </FormItem>
              )}
            />

            {/* Server error */}
            {serverError && (
              <p className="font-body text-destructive text-xs" role="alert">
                {serverError}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center gap-3 mt-2">
              {/* Delete controls — lower left, edit mode only */}
              {isEdit && (
                <div className="flex-1 flex">
                  <DeleteControls
                    deleteState={deleteState}
                    isDeleting={isDeleting}
                    disabled={isSubmitting || isDeleting}
                    onRequestDelete={() => setDeleteState('confirm')}
                    onCancelDelete={() => setDeleteState('idle')}
                    onConfirmDelete={handleDeleteConfirm}
                  />
                </div>
              )}

              {/* Cancel + Submit — hidden while delete confirmation is active */}
              {deleteState === 'idle' && (
                <div className={cn('flex gap-3', isEdit ? '' : 'flex-1')}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                    className={cn(
                      'rounded-[var(--radius)]',
                      'font-body uppercase tracking-[0.12em] text-xs text-muted',
                      'hover:text-foreground hover:bg-surface-2',
                      !isEdit && 'flex-1',
                    )}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn(
                      'rounded-[var(--radius)]',
                      'bg-accent text-accent-fg',
                      'font-body uppercase tracking-[0.12em] text-xs font-medium',
                      'hover:bg-accent/90',
                      'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      !isEdit && 'flex-1',
                    )}
                  >
                    {isEdit
                      ? isSubmitting
                        ? 'Saving...'
                        : 'Save Changes'
                      : isSubmitting
                        ? 'Saving...'
                        : 'Add'}
                  </Button>
                </div>
              )}
            </div>
          </form>
        </Form>
      </HudDialogContent>
    </Dialog>
  );
}
