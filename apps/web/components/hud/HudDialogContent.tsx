'use client';

/**
 * components/hud/HudDialogContent.tsx
 *
 * Shared HUD-styled wrapper around shadcn DialogContent.
 *
 * Applies the HUD surface treatment once so no individual modal
 * needs to repeat the same className set:
 *   bg-surface | border-border | rounded-[var(--radius)] | shadow-none
 *
 * Width comes from the DialogContent base class in components/ui/dialog.tsx:
 *   w-[calc(100%-2rem)] max-w-lg
 * — full viewport width minus a 1rem gutter on each side, capped at 32rem (512px).
 * Individual modals must NOT pass a max-w-* override unless they have a documented
 * reason; overriding narrows the modal unnecessarily.
 *
 * Usage:
 *   import { HudDialogContent } from '@/components/hud/HudDialogContent';
 *
 *   <Dialog ...>
 *     <HudDialogContent>
 *       ...
 *     </HudDialogContent>
 *   </Dialog>
 */

import { DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type * as React from 'react';

type HudDialogContentProps = React.ComponentPropsWithoutRef<typeof DialogContent>;

export function HudDialogContent({ className, ...props }: HudDialogContentProps) {
  return (
    <DialogContent
      className={cn(
        // HUD surface treatment — applied once here, not in each modal
        'bg-surface border-border',
        'rounded-[var(--radius)]',
        'shadow-none',
        // Caller may pass additional classes (e.g. for content-specific padding adjustments).
        // Do NOT pass max-w-* from callers — the base w-[calc(100%-2rem)] max-w-lg handles sizing.
        className,
      )}
      {...props}
    />
  );
}
