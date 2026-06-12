'use client';

/**
 * components/hud/HudDialogContent.tsx
 *
 * Thin HUD-themed wrapper around shadcn DialogContent.
 * Applies the HUD surface treatment once (bg-surface, border-border,
 * 2px radius, no shadow). Positioning/sizing/responsiveness live in
 * components/ui/dialog.tsx so behavior is consistent across all modals.
 */

import { DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type * as React from 'react';

type HudDialogContentProps = React.ComponentPropsWithoutRef<typeof DialogContent>;

export function HudDialogContent({ className, ...props }: HudDialogContentProps) {
  return (
    <DialogContent
      className={cn('bg-surface border-border rounded-[var(--radius)] shadow-none', className)}
      {...props}
    />
  );
}
