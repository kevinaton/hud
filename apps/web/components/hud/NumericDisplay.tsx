/**
 * NumericDisplay — Orbitron + tabular-nums with optional delta badge.
 *
 * Variants:
 *   hero    — 64px, weight 300, for hero net-income
 *   display — 32px, weight 400, for gross/expense sub-cards
 *   inline  — 20px, weight 400, for inline contexts
 */

import { cn } from '@/lib/utils';

interface DeltaBadge {
  /** Signed percentage value, e.g. 20 = "+20%" */
  value: number;
  /** true = INC (positive/cyan), false = DEC (negative/red) */
  positive: boolean;
}

interface NumericDisplayProps {
  value: number | string;
  variant?: 'hero' | 'display' | 'inline';
  delta?: DeltaBadge;
  className?: string;
}

const variantStyles = {
  hero: 'text-[64px] font-[400] leading-none',
  display: 'text-[32px] font-[400] leading-none',
  inline: 'text-[20px] font-[400] leading-none',
} as const;

export function NumericDisplay({
  value,
  variant = 'inline',
  delta,
  className,
}: NumericDisplayProps) {
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className={cn('font-display tabular text-foreground', variantStyles[variant])}>
        {value}
      </span>
      {delta !== undefined && <DeltaBadgeComponent value={delta.value} positive={delta.positive} />}
    </div>
  );
}

function DeltaBadgeComponent({ value, positive }: DeltaBadge) {
  const sign = positive ? '+' : '';
  const label = positive ? 'INC' : 'DEC';
  return (
    <span
      className={cn(
        'tabular text-[11px] font-[500] uppercase tracking-[0.1em] font-display',
        positive ? 'text-accent' : 'text-destructive',
      )}
    >
      {sign}
      {Math.abs(value)}% {label}
    </span>
  );
}
