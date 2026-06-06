/**
 * app/(app)/profile/page.tsx
 *
 * Profile page — authenticated users only.
 * Auth is enforced by the parent (app)/layout.tsx AND this page calls requireSession()
 * to obtain the current user's data for display.
 *
 * Layout (per hud-ui skill):
 *   - Sticky 56px header: back/hamburger left, "Profile" title center
 *   - Avatar section: current avatar + upload button
 *   - Edit profile form: displayName, email
 *   - Change password form: current + new + confirm
 *   - Log out button
 */

import { GridOverlay } from '@/components/hud/GridOverlay';
import { requireSession } from '@/lib/auth/index';
import type { Metadata } from 'next';
import { ProfileClient } from './_ProfileClient';

export const metadata: Metadata = {
  title: 'Profile — HUD',
};

export default async function ProfilePage() {
  const ctx = await requireSession();
  const { user } = ctx;

  return (
    <div className="relative flex flex-col min-h-screen bg-background">
      <GridOverlay />

      <div className="relative z-10 flex flex-col flex-1">
        {/* Page content — ProfileClient handles all interactive sections */}
        <ProfileClient
          userId={user.id}
          email={user.email}
          displayName={user.displayName ?? null}
          avatarPath={user.avatarPath ?? null}
        />
      </div>
    </div>
  );
}
