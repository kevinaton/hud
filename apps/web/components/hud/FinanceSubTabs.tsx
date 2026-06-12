'use client';

/**
 * FinanceSubTabs — Finance section tab bar (Cashflow | Airbnb | Reports).
 *
 * Client component so it can derive the active tab from usePathname.
 * Rendered by finance/layout.tsx below the shared HudHeader.
 */

import { TabBar } from '@/components/hud/TabBar';
import { usePathname } from 'next/navigation';

const FINANCE_TABS = [
  { label: 'Cashflow', href: '/finance/cashflow' },
  { label: 'Airbnb', href: '/finance/airbnb' },
  { label: 'Reports', href: '/finance/reports' },
];

export function FinanceSubTabs() {
  const pathname = usePathname();

  // Use prefix match so /finance/cashflow/report also activates Cashflow tab
  const active =
    FINANCE_TABS.find((t) => pathname.startsWith(t.href))?.href ??
    FINANCE_TABS[0].href;

  return <TabBar tabs={FINANCE_TABS} active={active} />;
}
