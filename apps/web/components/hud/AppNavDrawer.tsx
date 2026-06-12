'use client';

/**
 * AppNavDrawer — slide-in navigation drawer.
 *
 * Shows Finance / Logs / Airbnb top-level sections.
 * Triggered by the hamburger button in section layouts.
 *
 * Uses a simple fixed overlay + slide panel — no shadcn Sheet dependency.
 * Per hud-ui skill: bg-surface, border-border, sharp 2px radius, no shadows.
 */

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

const NAV_ITEMS = [
  {
    label: 'FINANCE',
    href: '/finance/cashflow',
    match: '/finance',
    children: [
      { label: 'Cashflow', href: '/finance/cashflow' },
      { label: 'Airbnb', href: '/finance/airbnb' },
      { label: 'Reports', href: '/finance/reports' },
    ],
  },
  { label: 'LOGS', href: '/logs', match: '/logs', children: [] },
  { label: 'NEXUS', href: '/nexus', match: '/nexus', children: [] },
];

interface AppNavDrawerProps {
  currentPath?: string;
}

export function AppNavDrawer({ currentPath }: AppNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

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

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      {/* Hamburger trigger */}
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="app-nav-drawer"
        className="flex h-14 w-14 items-center justify-center text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => setOpen(true)}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 5H17M3 10H17M3 15H17"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div aria-hidden="true" className="fixed inset-0 z-40 bg-background/80" onClick={close} />
      )}

      {/* Drawer panel */}
      <div
        id="app-nav-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-64 bg-surface border-r border-border',
          'transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Drawer header */}
        <div className="flex h-14 items-center border-b border-border px-4">
          <span className="font-display text-[13px] uppercase tracking-[0.2em] text-accent">
            HUD
          </span>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={close}
            className="ml-auto flex h-8 w-8 items-center justify-center text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-[var(--radius)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 3L13 13M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav aria-label="Main navigation" className="py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPath?.startsWith(item.match);
            return (
              <div key={item.href}>
                {/* Top-level item */}
                <Link
                  href={item.href}
                  onClick={close}
                  className={cn(
                    'flex items-center px-4 py-3 font-body text-[14px] uppercase tracking-[0.1em]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    'transition-colors',
                    isActive ? 'text-accent' : 'text-muted hover:text-foreground',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && <span aria-hidden="true" className="mr-2 h-4 w-0.5 bg-accent" />}
                  {item.label}
                </Link>

                {/* Sub-items (always visible when parent is active) */}
                {item.children.length > 0 && isActive && (
                  <div className="pb-1">
                    {item.children.map((child) => {
                      const childActive = currentPath === child.href || currentPath?.startsWith(child.href + '/');
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={close}
                          className={cn(
                            'flex items-center pl-8 pr-4 py-2 font-body text-[13px]',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            'transition-colors',
                            childActive ? 'text-accent' : 'text-muted hover:text-foreground',
                          )}
                          aria-current={childActive ? 'page' : undefined}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </>
  );
}
