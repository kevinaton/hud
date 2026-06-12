'use client';

/**
 * components/ui/popover.tsx
 *
 * Custom Popover — zero Radix dependencies.
 *
 * Content is rendered into document.body via createPortal and positioned with
 * `position: fixed` derived from the anchor's getBoundingClientRect(). This
 * avoids clipping by parent overflow (important when used inside a Dialog).
 *
 * Position is recalculated on open, resize, and scroll so the panel stays
 * anchored to the trigger on any layout change.
 *
 * Click-outside and Escape key close the popover.
 *
 * API matches the previous @radix-ui/react-popover version:
 *   <Popover open onOpenChange>
 *     <PopoverTrigger asChild><button /></PopoverTrigger>
 *     <PopoverContent align sideOffset>…</PopoverContent>
 *   </Popover>
 */

import * as React from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PopoverContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ref set on the Popover wrapper div — used to measure position */
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

// ---------------------------------------------------------------------------
// Popover (root)
// ---------------------------------------------------------------------------

interface PopoverProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

function Popover({ open = false, onOpenChange = () => {}, children }: PopoverProps) {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  return (
    <PopoverContext.Provider value={{ open, onOpenChange, anchorRef }}>
      {/* Wrapper gives PopoverContent an anchor rect to measure against */}
      <div ref={anchorRef}>{children}</div>
    </PopoverContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// PopoverTrigger
// ---------------------------------------------------------------------------

interface PopoverTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** When true, renders the child element directly instead of wrapping in a button.
   *  Uses React.cloneElement to inject the toggle onClick. */
  asChild?: boolean;
}

const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverTriggerProps>(
  ({ asChild = false, children, onClick, ...props }, ref) => {
    const ctx = React.useContext(PopoverContext);

    function handleClick(e: React.MouseEvent) {
      ctx?.onOpenChange(!ctx.open);
    }

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement>>;
      return React.cloneElement(child, {
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          handleClick(e);
          child.props.onClick?.(e);
        },
      });
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          handleClick(e);
          onClick?.(e);
        }}
        {...props}
      >
        {children}
      </button>
    );
  },
);
PopoverTrigger.displayName = 'PopoverTrigger';

// ---------------------------------------------------------------------------
// PopoverContent
// ---------------------------------------------------------------------------

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = 'center', sideOffset = 4, children, ...props }, ref) => {
    const ctx = React.useContext(PopoverContext);
    const [mounted, setMounted] = React.useState(false);
    const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({});

    // Gate portal until client is mounted
    React.useEffect(() => {
      setMounted(true);
    }, []);

    // Recalculate position whenever open toggles or viewport changes
    React.useEffect(() => {
      if (!ctx?.open || !ctx.anchorRef.current) return;

      function updatePosition() {
        if (!ctx?.anchorRef.current) return;
        const rect = ctx.anchorRef.current.getBoundingClientRect();
        // fixed positioning is viewport-relative — getBoundingClientRect values apply directly
        setPanelStyle({
          position: 'fixed',
          top: rect.bottom + sideOffset,
          left: rect.left,
          width: rect.width,
          zIndex: 50,
        });
      }

      updatePosition();
      window.addEventListener('resize', updatePosition);
      // Capture phase catches scroll inside overflow containers (e.g. Dialog)
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }, [ctx?.open, ctx?.anchorRef, sideOffset]);

    // Click-outside closes the popover
    React.useEffect(() => {
      if (!ctx?.open) return;
      function handleMouseDown(e: MouseEvent) {
        if (ctx?.anchorRef.current && !ctx.anchorRef.current.contains(e.target as Node)) {
          ctx.onOpenChange(false);
        }
      }
      document.addEventListener('mousedown', handleMouseDown);
      return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [ctx?.open]);

    // Escape key closes the popover
    React.useEffect(() => {
      if (!ctx?.open) return;
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') ctx?.onOpenChange(false);
      }
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [ctx?.open]);

    if (!mounted || !ctx?.open) return null;

    return createPortal(
      <div
        ref={ref}
        style={panelStyle}
        className={cn('z-50 outline-none', className)}
        {...props}
      >
        {children}
      </div>,
      document.body,
    );
  },
);
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverTrigger, PopoverContent };
