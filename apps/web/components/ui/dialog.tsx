'use client';

/**
 * components/ui/dialog.tsx
 *
 * Custom modal dialog — zero Radix dependencies.
 *
 * Behaviour:
 *   - Portal: content is appended to document.body via createPortal
 *   - Escape key closes the dialog
 *   - Body scroll is locked while dialog is open
 *   - Clicking the overlay closes the dialog
 *   - Click inside the content panel does not bubble to overlay
 *   - Close (×) button top-right of content
 *
 * Safari-mobile-safe positioning:
 *   fixed left-4 right-4 top-1/2 -translate-y-1/2 — avoids iOS auto-margin bugs.
 *   mx-auto + max-w-lg centers on wider viewports.
 *
 * Public API matches the previous @radix-ui/react-dialog–backed version so all
 * consumers (TransactionModal, CashflowDateRangeModal, command.tsx, etc.) need no
 * import changes.
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Context — shared between Dialog root and its sub-components
// ---------------------------------------------------------------------------

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogCtx(): DialogContextValue {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error('Dialog sub-components must be rendered inside <Dialog>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Dialog (root)
// ---------------------------------------------------------------------------

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

function Dialog({ open = false, onOpenChange = () => {}, children }: DialogProps) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// DialogTrigger
// ---------------------------------------------------------------------------

const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, children, ...props }, ref) => {
  const { onOpenChange } = useDialogCtx();
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        onOpenChange(true);
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
});
DialogTrigger.displayName = 'DialogTrigger';

// ---------------------------------------------------------------------------
// DialogPortal — no-op; kept for API compatibility
// ---------------------------------------------------------------------------

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// DialogOverlay — exported for API compatibility; used as a plain styled div
// ---------------------------------------------------------------------------

const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-black/80', className)}
      {...props}
    />
  ),
);
DialogOverlay.displayName = 'DialogOverlay';

// ---------------------------------------------------------------------------
// DialogClose
// ---------------------------------------------------------------------------

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, children, ...props }, ref) => {
  const { onOpenChange } = useDialogCtx();
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        onOpenChange(false);
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
});
DialogClose.displayName = 'DialogClose';

// ---------------------------------------------------------------------------
// DialogContent — portal + overlay + panel in one
// ---------------------------------------------------------------------------

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { open, onOpenChange } = useDialogCtx();
    const [mounted, setMounted] = React.useState(false);

    // Only render into the DOM once we're client-side
    React.useEffect(() => {
      setMounted(true);
    }, []);

    // Escape key
    React.useEffect(() => {
      if (!open) return;
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') onOpenChange(false);
      }
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onOpenChange]);

    // Body scroll lock
    React.useEffect(() => {
      if (!open) return;
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }, [open]);

    if (!mounted || !open) return null;

    return createPortal(
      // Single fixed overlay — fills the viewport and flex-centers the panel.
      // Flexbox centering avoids `transform` on fixed elements, which triggers
      // an iOS Safari bug where the element renders blank or off-screen.
      <div
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        onClick={() => onOpenChange(false)}
      >
        {/* Panel — relative child of the flex overlay; no transform needed */}
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          className={cn(
            'relative w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto',
            'grid gap-4 border bg-background p-6',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
          {...props}
        >
          {children}

          {/* Close button */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
      </div>,
      document.body,
    );
  },
);
DialogContent.displayName = 'DialogContent';

// ---------------------------------------------------------------------------
// Layout helpers (pure HTML — no library dependency)
// ---------------------------------------------------------------------------

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  ),
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
