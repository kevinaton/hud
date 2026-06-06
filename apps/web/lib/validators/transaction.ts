/**
 * lib/validators/transaction.ts
 *
 * Shared Zod schema for the "create transaction" form and POST /api/transactions.
 *
 * Important: the form sends `amount` as a decimal string (e.g. "280.00" or "-280").
 * The server converts it to `amount_minor` via Math.round(amount * 100).
 * The schema validates the decimal at the API boundary and ensures it is non-zero.
 *
 * Per hud-money skill: the final amount_minor is the only money representation
 * allowed inside the DB and business logic layers.
 */

import { z } from 'zod';

export const createTransactionSchema = z.object({
  /** Human-readable description of the transaction (e.g. "Grocery", "Jeep"). */
  item: z.string().trim().min(1, 'Item is required').max(200, 'Item is too long'),

  /**
   * Decimal amount as a number (the form submits it as number via valueAsNumber
   * or parseFloat of a string). Non-zero, finite.
   * Negative = expense (red). Positive = income (green).
   */
  amount: z
    .number({ invalid_type_error: 'Amount must be a number' })
    .finite('Amount must be a finite number')
    .refine((v) => v !== 0, { message: 'Amount must be non-zero' }),

  /**
   * ISO-8601 date string (YYYY-MM-DD). Required.
   * The server appends a time + timezone offset to produce a full occurred_at.
   */
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),

  /**
   * Category name (string from combobox — may be an existing name or a new
   * free-text name). Optional — uncategorized transactions are allowed.
   */
  categoryName: z.string().trim().max(100, 'Category name is too long').optional().nullable(),

  /** Optional notes / memo. */
  notes: z.string().trim().max(1000, 'Notes are too long').optional().nullable(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

/**
 * Schema for PUT /api/transactions/[id].
 *
 * All fields are optional — but at least one must be present.
 * The server applies only the provided fields, leaving others unchanged.
 */
export const updateTransactionSchema = z
  .object({
    /** Human-readable description of the transaction. */
    item: z.string().trim().min(1, 'Item is required').max(200, 'Item is too long').optional(),

    /**
     * Decimal amount as a number. Non-zero, finite.
     * Negative = expense (red). Positive = income (green).
     */
    amount: z
      .number({ invalid_type_error: 'Amount must be a number' })
      .finite('Amount must be a finite number')
      .refine((v) => v !== 0, { message: 'Amount must be non-zero' })
      .optional(),

    /**
     * ISO-8601 date string (YYYY-MM-DD). Optional.
     */
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .optional(),

    /** Category name. Optional — pass null to remove. */
    categoryName: z.string().trim().max(100, 'Category name is too long').optional().nullable(),

    /** Optional notes / memo. Pass null to clear. */
    notes: z.string().trim().max(1000, 'Notes are too long').optional().nullable(),
  })
  .refine(
    (v) =>
      v.item !== undefined ||
      v.amount !== undefined ||
      v.date !== undefined ||
      v.categoryName !== undefined ||
      v.notes !== undefined,
    { message: 'At least one field must be provided' },
  );

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
