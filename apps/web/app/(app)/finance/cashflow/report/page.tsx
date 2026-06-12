/**
 * app/(app)/finance/cashflow/report/page.tsx
 *
 * Report stub — tabs now handled by FinanceSubTabs in finance/layout.tsx.
 */

import { GridOverlay } from '@/components/hud/GridOverlay';

export default function ReportPage() {
  return (
    <div className="relative flex flex-col flex-1 bg-background">
      <GridOverlay />
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="font-body text-muted uppercase" style={{ fontSize: '14px', letterSpacing: '0.12em' }}>
          Report — Coming in a future phase
        </p>
      </div>
    </div>
  );
}
