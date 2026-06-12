/**
 * app/(app)/nexus/page.tsx
 *
 * Nexus — placeholder for the Obsidian / knowledge phase.
 */

import { GridOverlay } from '@/components/hud/GridOverlay';

export default function NexusPage() {
  return (
    <main className="relative flex-1">
      <GridOverlay />
      <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
        <p className="font-display text-[13px] uppercase tracking-[0.2em] text-accent">Nexus</p>
        <p className="mt-2 font-body text-[14px] text-muted">
          The knowledge phase — Obsidian vault, notes, and agent memory.
        </p>
        <p className="mt-1 font-body text-[12px] text-muted">Coming soon.</p>
      </div>
    </main>
  );
}
