/**
 * (app) route group layout — protected area.
 *
 * Enforces auth via requireSession() and renders the shared HudHeader
 * (top nav + mobile hamburger) for every page in this group.
 */

import { HudHeader } from '@/components/hud/HudHeader';
import { requireSession } from '@/lib/auth/index';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HUD',
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireSession();
  const { user } = ctx;

  return (
    <div className="flex min-h-screen flex-col">
      <HudHeader
        avatarPath={user.avatarPath ?? null}
        displayName={user.displayName ?? null}
        email={user.email}
      />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
