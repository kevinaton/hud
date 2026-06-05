'use client';

/**
 * components/hud/AddTransactionModal.tsx
 *
 * Modal form for adding a new transaction.
 *
 * - Opens via the [+] button on the cashflow page.
 * - Validates with React Hook Form + Zod (same schema as the server).
 * - Posts to POST /api/transactions with the CSRF token in X-CSRF-Token header.
 * - On success: calls onSuccess() so the parent can call router.refresh().
 *
 * Per hud-ui skill:
 *   - Oxanium for body/labels, Orbitron for the amount input
 *   - 2px radius, cyan focus rings, no inline hex, no box-shadow
 *   - Cyberpunk dark surfaces (bg-surface, bg-surface-2)
 *
 * Per hud-money skill:
 *   - `amount` is submitted as a number (decimal). The server converts it to
 *     minor units via Math.round(amount * 100). No float math here.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { CategoryCombobox } from '@/components/hud/CategoryCombobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

interface AddTransactionModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Called to close the modal. */
  onOpenChange: (open: boolean) => void;
  /** Available categories to populate the combobox. */
  categories: Category[];
}

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

/** Read the CSRF token from the hud_csrf cookie. */
function readCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const cookieName = 'hud_csrf';
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${cookieName}=`));
  return match ? match.split('=')[1] : '';
}

export function AddTransactionModal({ open, onOpenChange, categories }: AddTransactionModalProps) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<CreateTransactionInput>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      item: '',
      amount: undefined as unknown as number,
      date: getTodayManila(),
      categoryName: '',
      notes: '',
    },
  });

  // Reset form and errors when modal opens
  React.useEffect(() => {
    if (open) {
      form.reset({
        item: '',
        amount: undefined as unknown as number,
        date: getTodayManila(),
        categoryName: '',
        notes: '',
      });
      setServerError(null);
    }
  }, [open, form]);

  /** Handle a non-ok response from the server. */
  async function handleErrorResponse(res: Response) {
    const json = await res.json().catch(() => ({}));
    if (res.status === 400 && json.fieldErrors) {
      applyFieldErrors(json.fieldErrors as Record<string, string[] | undefined>);
    } else if (res.status === 403) {
      setServerError('Session expired. Please reload the page and try again.');
    } else if (res.status === 401) {
      setServerError('Not authenticated. Please log in again.');
    } else {
      setServerError(json.error ?? 'An unexpected error occurred. Please try again.');
    }
  }

  /** Map server field errors back into React Hook Form. */
  function applyFieldErrors(fe: Record<string, string[] | undefined>) {
    for (const field of Object.keys(fe) as Array<keyof CreateTransactionInput>) {
      const msgs = fe[field as string];
      if (msgs && msgs.length > 0) {
        form.setError(field, { message: msgs[0] });
      }
    }
  }

  async function onSubmit(data: CreateTransactionInput) {
    setIsSubmitting(true);
    setServerError(null);

    try {
      const csrfToken = readCsrfCookie();
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          item: data.item,
          amount: data.amount,
          date: data.date,
          categoryName: data.categoryName || null,
          notes: data.notes || null,
        }),
      });

      if (res.ok) {
        // Close modal, then refresh Server Component data on the cashflow page
        onOpenChange(false);
        router.refresh();
      } else {
        await handleErrorResponse(res);
      }
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-md w-full',
          'bg-surface border-border',
          'rounded-[var(--radius)]',
          // Override shadcn default shadow
          'shadow-none',
        )}
      >
        <DialogHeader>
          <DialogTitle
            className="font-body text-foreground uppercase tracking-[0.18em]"
            style={{ fontSize: '12px', fontWeight: 500 }}
          >
            Add Transaction
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2">
            {/* ---------------------------------------------------------------- */}
            {/* Item                                                              */}
            {/* ---------------------------------------------------------------- */}
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

            {/* ---------------------------------------------------------------- */}
            {/* Amount                                                            */}
            {/* ---------------------------------------------------------------- */}
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
                          // Allow clearing/starting a negative number
                          field.onChange(raw === '' ? undefined : raw);
                        } else {
                          const parsed = Number.parseFloat(raw);
                          field.onChange(Number.isNaN(parsed) ? undefined : parsed);
                        }
                      }}
                      className={cn(
                        'rounded-[var(--radius)] border-border bg-transparent',
                        // Orbitron for the numeric input per hud-ui skill
                        'font-display tabular text-foreground placeholder:text-muted placeholder:font-body',
                        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      )}
                    />
                  </FormControl>
                  <FormMessage className="font-body text-xs" />
                </FormItem>
              )}
            />

            {/* ---------------------------------------------------------------- */}
            {/* Date                                                              */}
            {/* ---------------------------------------------------------------- */}
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

            {/* ---------------------------------------------------------------- */}
            {/* Category                                                          */}
            {/* ---------------------------------------------------------------- */}
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

            {/* ---------------------------------------------------------------- */}
            {/* Notes                                                             */}
            {/* ---------------------------------------------------------------- */}
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

            {/* ---------------------------------------------------------------- */}
            {/* Server error                                                      */}
            {/* ---------------------------------------------------------------- */}
            {serverError && (
              <p className="font-body text-destructive text-xs" role="alert">
                {serverError}
              </p>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* Submit / Cancel                                                   */}
            {/* ---------------------------------------------------------------- */}
            <div className="flex gap-3 mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className={cn(
                  'flex-1 rounded-[var(--radius)]',
                  'font-body uppercase tracking-[0.12em] text-xs text-muted',
                  'hover:text-foreground hover:bg-surface-2',
                )}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  'flex-1 rounded-[var(--radius)]',
                  'bg-accent text-accent-fg',
                  'font-body uppercase tracking-[0.12em] text-xs font-medium',
                  'hover:bg-accent/90',
                  'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                )}
              >
                {isSubmitting ? 'Saving...' : 'Add'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
