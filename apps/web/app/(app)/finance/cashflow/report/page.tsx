/**
 * app/(app)/finance/cashflow/report/page.tsx
 *
 * Report tab stub — not a 404. Will be implemented in a future phase.
 */

import { GridOverlay } from '@/components/hud/GridOverlay';
import { TabBar } from '@/components/hud/TabBar';

const TABS = [
  { label: 'Cashflow', href: '/finance/cashflow' },
  { label: 'Report', href: '/finance/cashflow/report' },
];

export default function ReportPage() {
  return (
    <div className="relative flex flex-col flex-1 bg-background">
      <GridOverlay />

      <div className="relative z-10 flex flex-col flex-1">
        <TabBar tabs={TABS} active="/finance/cashflow/report" />

        <div className="flex flex-1 items-center justify-center px-4">
          <p
            className="font-body text-muted uppercase"
            style={{ fontSize: '14px', letterSpacing: '0.12em' }}
          >
            Report — Coming in a future phase
          </p>
        </div>
      </div>
    </div>
  );
}
