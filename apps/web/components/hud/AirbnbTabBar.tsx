'use client';

/**
 * components/hud/AirbnbTabBar.tsx
 *
 * Three-tab navigation for the Airbnb balance sheet page.
 * Tabs: Bookings | Pay Outs | Cancelled
 *
 * Tab state is driven by URL search param ?tab=bookings (default).
 * Navigates by replacing the URL, preserving the active ?filter= param.
 *
 * Active tab: cyan underline (bg-accent, 2px) + text-accent.
 * Inactive tabs: text-muted, hover text-foreground.
 *
 * Per hud-ui: no inline hex, all tokens from globals.css.
 */

import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';

export type AirbnbTab = 'bookings' | 'payouts' | 'cancelled';

const TABS: { id: AirbnbTab; label: string }[] = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'payouts', label: 'Pay Outs' },
  { id: 'cancelled', label: 'Cancelled' },
];

interface AirbnbTabBarProps {
  /** The active tab resolved server-side (avoids flash before hydration). */
  activeTab: AirbnbTab;
}

export function AirbnbTabBar({ activeTab }: AirbnbTabBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab');
  const currentTab: AirbnbTab =
    rawTab === 'payouts' || rawTab === 'cancelled'
      ? rawTab
      : rawTab === null
        ? activeTab
        : 'bookings';

  function handleTabClick(tab: AirbnbTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/finance/airbnb?${params.toString()}`);
  }

  return (
    <nav aria-label="Airbnb tabs" className="flex border-b border-border">
      {TABS.map((tab) => {
        const isActive = tab.id === currentTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              'relative px-4 py-3 font-body text-[14px] font-[500] uppercase tracking-[0.1em]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'transition-colors',
              isActive ? 'text-accent' : 'text-muted hover:text-foreground',
            )}
          >
            {tab.label}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
