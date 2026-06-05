'use client';

/**
 * TabBar — underlined cyan active tab, muted inactive tabs.
 * Uses Next.js <Link> for navigation and highlights the active route.
 */

import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Tab {
  label: string;
  href: string;
}

interface TabBarProps {
  tabs: Tab[];
  /** The href of the currently active tab */
  active: string;
}

export function TabBar({ tabs, active }: TabBarProps) {
  return (
    <nav aria-label="Page tabs" className="flex border-b border-border">
      {tabs.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'relative px-4 py-3 font-body text-[14px] font-[500] uppercase tracking-[0.1em]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'transition-colors',
              isActive ? 'text-accent' : 'text-muted hover:text-foreground',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
