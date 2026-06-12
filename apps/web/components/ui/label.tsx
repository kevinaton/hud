'use client';

/**
 * components/ui/label.tsx
 *
 * Plain HTML <label> wrapper — no Radix dependency.
 * Matches the same className contract as the previous @radix-ui/react-label version
 * so callers need no changes.
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export { Label };
