/**
 * WarningCounter — large Orbitron numeral (e.g. "02") with a label below.
 * Used on the login screen to show failed-attempt count.
 */

import { cn } from '@/lib/utils';

interface WarningCounterProps {
  /** The count to display (zero-padded to 2 digits). */
  count: number;
  /** Caption label. Default: "Warning Attempts". */
  label?: string;
  className?: string;
}

export function WarningCounter({
  count,
  label = 'Warning Attempts',
  className,
}: WarningCounterProps) {
  const display = String(count).padStart(2, '0');

  return (
    <div className={cn('flex flex-col items-start', className)}>
      <span
        className="font-display tabular text-warning leading-none"
        style={{ fontSize: '64px', fontWeight: 400 }}
        aria-label={`${count} ${label}`}
      >
        {display}
      </span>
      <span
        className="mt-1 font-body uppercase text-muted"
        style={{ fontSize: '11px', letterSpacing: '0.18em' }}
        aria-hidden="true"
      >
        {label}
      </span>
    </div>
  );
}
