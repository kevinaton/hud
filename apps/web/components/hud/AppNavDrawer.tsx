'use client';

/**
 * AppNavDrawer — mobile navigation drawer.
 *
 * Slides in from the left at 60vw. The remainder of the screen shows
 * the page content blurred + dimmed behind a backdrop overlay.
 *
 * Contains its own hamburger trigger (md:hidden).
 * 3 flat nav items: Finance | Logs | Nexus.
 * Active item: full-row accent (cyan) background.
 *
 * Safari mobile fixes:
 * - h-dvh instead of h-full (Safari doesn't resolve h-full on fixed elements)
 * - WebkitBackdropFilter set via inline style (Tailwind class alone unreliable on Safari)
 * - Scroll lock uses position:fixed on body (overflow:hidden doesn't work on iOS)
 */

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const NAV_ITEMS = [
  { label: 'Finance', href: '/finance/cashflow', match: '/finance' },
  { label: 'Logs', href: '/logs', match: '/logs' },
  { label: 'Nexus', href: '/nexus', match: '/nexus' },
] as const;

export function AppNavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const scrollYRef = useRef(0);

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, close]);

  // iOS-safe scroll lock — position:fixed preserves scroll position
  useEffect(() => {
    if (open) {
      scrollYRef.current = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.width = '100%';
    } else {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollYRef.current);
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, [open]);

  return (
    <>
      {/* Hamburger trigger — mobile only */}
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="app-nav-drawer"
        className="md:hidden flex h-14 w-14 items-center justify-center text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => setOpen(true)}
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M3 5H17M3 10H17M3 15H17"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Backdrop — blur + dim. Conditionally rendered so it's fully removed when closed. */}
      {open && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[60] bg-background/60"
          style={{
            WebkitBackdropFilter: 'blur(10px)',
            backdropFilter: 'blur(10px)',
          }}
          onClick={close}
        />
      )}

      {/* Drawer panel — solid bg, sits above backdrop */}
      <div
        id="app-nav-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        inert={!open || undefined}
        style={{ transform: open ? 'translateX(0)' : 'translateX(-100%)', width: '60vw', height: '100dvh' }}
        className="fixed left-0 top-0 z-[70] bg-background transition-transform duration-200 ease-out"
      >
        {/* HUD wordmark */}
        <div className="flex h-[100px] items-end justify-center pb-5 border-b border-border">
          <Link
            href="/finance/cashflow"
            onClick={close}
            className="font-display text-[26px] uppercase tracking-[0.3em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            HUD
          </Link>
        </div>

        {/* Nav items */}
        <nav aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center justify-center py-6',
                  'font-body text-[14px] font-semibold uppercase tracking-[0.15em]',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-foreground hover:bg-surface',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
