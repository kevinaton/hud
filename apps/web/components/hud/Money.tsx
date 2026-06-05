/**
 * Money — the ONE place an amount_minor becomes a display string.
 * Uses formatMoney from lib/money/format.ts.
 *
 * variant:
 *   'auto'    (default) — negative → text-destructive, positive/zero → text-success
 *   'neutral' — text-foreground always (for hero card where color isn't the signal)
 */

import { formatMoney } from '@/lib/money/format';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';

export type Currency = string;

interface MoneyProps {
  amountMinor: number;
  currency: Currency;
  variant?: 'auto' | 'neutral';
  className?: string;
  style?: CSSProperties;
}

export function Money({ amountMinor, currency, variant = 'auto', className, style }: MoneyProps) {
  const formatted = formatMoney(amountMinor, currency);

  const colorClass =
    variant === 'neutral'
      ? 'text-foreground'
      : amountMinor < 0
        ? 'text-destructive'
        : 'text-success';

  return (
    <span
      className={cn('font-display tabular', colorClass, className)}
      style={style}
      aria-label={formatted}
    >
      {formatted}
    </span>
  );
}
