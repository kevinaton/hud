/**
 * app/(app)/finance/reports/page.tsx
 *
 * Reports — placeholder for the next phase.
 */

import { GridOverlay } from '@/components/hud/GridOverlay';

export default function ReportsPage() {
  return (
    <main className="relative flex-1">
      <GridOverlay />
      <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
        <p className="font-display text-[13px] uppercase tracking-[0.2em] text-accent">Reports</p>
        <p className="mt-2 font-body text-[14px] text-muted">Coming in the next phase.</p>
      </div>
    </main>
  );
}
