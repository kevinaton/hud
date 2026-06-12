/**
 * app/(app)/finance/layout.tsx
 *
 * Finance section shell — adds the Cashflow | Airbnb | Reports sub-tab bar
 * below the shared HudHeader (rendered by the parent (app)/layout.tsx).
 */

import { FinanceSubTabs } from '@/components/hud/FinanceSubTabs';

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <FinanceSubTabs />
      {children}
    </div>
  );
}
