/**
 * GridOverlay — absolute-positioned faint cross-grid SVG background.
 * Place at the top of any full-screen view (login, cashflow).
 * pointer-events: none so it never captures mouse events.
 */

interface GridOverlayProps {
  /** Grid cell size in px. Default 32. */
  cell?: number;
}

export function GridOverlay({ cell = 36 }: GridOverlayProps) {
  const id = 'hud-grid-pattern';

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id={id} width={cell} height={cell} patternUnits="userSpaceOnUse">
          {/* Vertical line */}
          <path
            d={`M ${cell} 0 L 0 0 0 ${cell}`}
            fill="none"
            stroke="var(--grid)"
            strokeOpacity="0.6"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
