/**
 * TransactionRow — a single transaction list item.
 *
 * Layout:
 *   [item name (white, Oxanium)]           [amount (green/red, right-aligned)]
 *   [DATE | CATEGORY (muted, uppercase)]
 */

import { cn } from '@/lib/utils';
import { Money } from './Money';

export interface TransactionDisplay {
  id: number | string;
  item: string;
  amountMinor: number;
  currency: string;
  /** ISO-8601 date string, e.g. "2026-06-24T00:00:00+08:00" */
  occurredAt: string;
  category?: string;
}

interface TransactionRowProps {
  tx: TransactionDisplay;
  className?: string;
}

/** Month abbreviations — hardcoded to avoid locale-dependent output. */
const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/**
 * Format an ISO-8601 date string as "MMM DD, YYYY" (e.g. "JUN 24, 2026").
 * Uses hardcoded month names — locale-independent by design.
 * Parses the date in UTC so results are consistent regardless of runtime TZ.
 */
/**
 * Format an ISO-8601 date string as "MMM DD, YYYY" (e.g. "JUN 24, 2026").
 * Uses hardcoded month names — locale-independent by design.
 * Reads the YYYY-MM-DD prefix directly rather than via Date methods to avoid
 * timezone ambiguity between the stored offset and the runtime timezone.
 */
function formatDate(iso: string): string {
  // Parse the date component from the ISO string prefix — avoids any
  // Date constructor / runtime timezone interaction.
  const datePart = iso.slice(0, 10); // "YYYY-MM-DD"
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10); // 1-indexed
  const day = Number.parseInt(dayStr, 10);

  const monthName = MONTHS[month - 1] ?? 'UNK';
  const dayPadded = String(day).padStart(2, '0');

  return `${monthName} ${dayPadded}, ${year}`;
}

export function TransactionRow({ tx, className }: TransactionRowProps) {
  const datePart = formatDate(tx.occurredAt);
  const metaParts = [datePart, tx.category].filter(Boolean).join(' | ');

  return (
    <div className={cn('flex items-start justify-between p-3 border-b border-border', className)}>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="font-body text-foreground text-[15px] truncate">{tx.item}</span>
        <span
          className="font-body text-muted uppercase"
          style={{ fontSize: '11px', letterSpacing: '0.1em' }}
        >
          {metaParts}
        </span>
      </div>
      <Money
        amountMinor={tx.amountMinor}
        currency={tx.currency}
        className="ml-4 text-[15px] shrink-0"
      />
    </div>
  );
}
