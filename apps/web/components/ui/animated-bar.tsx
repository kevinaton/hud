'use client';

/**
 * AnimatedBar — reusable accent bar, typically fixed to the bottom of the viewport.
 *
 * Animation: slow left-to-right gradient sweep (CSS keyframes).
 * Place on any page by rendering <AnimatedBar /> in the page component.
 *
 * Props:
 *  - className  — additional Tailwind / CSS classes (layout, position overrides)
 *  - variant    — 'accent' (default cyan sweep) | 'warning' | 'destructive' | 'success'
 *  - color      — raw CSS color string; overrides variant when provided
 */

import { cn } from '@/lib/utils';

type AnimatedBarVariant = 'accent' | 'warning' | 'destructive' | 'success';

interface AnimatedBarProps {
  className?: string;
  variant?: AnimatedBarVariant;
  /** Raw CSS color (e.g. oklch value). Overrides `variant` when supplied. */
  color?: string;
}

/**
 * Map variant names to the CSS custom property holding the color.
 * We reference CSS vars rather than inlining hex so we stay within the
 * "no new hex codes outside globals.css" rule.
 */
const variantColorVar: Record<AnimatedBarVariant, string> = {
  accent: 'var(--accent)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  success: 'var(--success)',
};

export function AnimatedBar({ className, variant = 'accent', color }: AnimatedBarProps) {
  const baseColor = color ?? variantColorVar[variant];

  return (
    <>
      {/* Keyframe definition — inlined as a <style> so the component is self-contained */}
      <style>{`
        @keyframes hud-bar-sweep {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .hud-animated-bar {
          background: linear-gradient(
            90deg,
            transparent 0%,
            ${baseColor} 25%,
            color-mix(in oklch, ${baseColor} 60%, transparent) 50%,
            ${baseColor} 75%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: hud-bar-sweep 3s linear infinite;
        }
      `}</style>
      <div
        aria-hidden="true"
        className={cn('hud-animated-bar fixed bottom-0 left-0 right-0 h-[2px]', className)}
      />
    </>
  );
}
