/**
 * HazardStripe — diagonal black-on-near-black stripe divider.
 * Used between hero card and transaction list sections.
 */

interface HazardStripeProps {
  /** Height in px. Default 18. */
  height?: number;
}

export function HazardStripe({ height = 18 }: HazardStripeProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        height: `${height}px`,
        background: 'repeating-linear-gradient(45deg, #1a1a1a 0 12px, transparent 12px 24px)',
        width: '100%',
      }}
    />
  );
}
