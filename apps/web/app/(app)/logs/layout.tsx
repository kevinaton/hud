/**
 * app/(app)/logs/layout.tsx
 *
 * Logs section shell — sticky header with nav drawer (left), "Logs" title (center),
 * avatar link to /profile (right).
 * Auth is enforced by the parent (app)/layout.tsx.
 */

import { AppNavDrawer } from '@/components/hud/AppNavDrawer';
import { AvatarDisplay } from '@/components/hud/AvatarDisplay';
import { requireSession } from '@/lib/auth/index';
import Link from 'next/link';

export default async function LogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireSession();
  const { user } = ctx;

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="sticky top-0 z-50 flex h-14 items-center bg-background border-b border-border"
        style={{ height: '56px' }}
      >
        <AppNavDrawer currentPath="/logs" />

        <div className="absolute inset-x-0 flex justify-center pointer-events-none">
          <span className="font-body text-foreground" style={{ fontSize: '16px', fontWeight: 500 }}>
            Logs
          </span>
        </div>

        <div className="ml-auto pr-3">
          <Link
            href="/profile"
            aria-label="Go to profile"
            className="flex items-center justify-center rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <AvatarDisplay
              avatarPath={user.avatarPath ?? null}
              displayName={user.displayName ?? null}
              email={user.email}
              size={32}
            />
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
