/**
 * app/(app)/finance/layout.tsx
 *
 * Finance section shell — sticky header with hamburger (left), "Finance" title (center),
 * and avatar link to /profile (right).
 * Auth is enforced by the parent (app)/layout.tsx via requireSession().
 *
 * Header spec (per hud-ui skill):
 *   - Height: 56px
 *   - Background: bg-background with --border bottom border
 *   - Hamburger: left, aria-label="Open navigation"
 *   - "Finance" title: center, Oxanium 500 16px
 *   - Avatar link: right, navigates to /profile
 */

import { AvatarDisplay } from '@/components/hud/AvatarDisplay';
import { requireSession } from '@/lib/auth/index';
import Link from 'next/link';

export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireSession is already called in (app)/layout.tsx but we need user data for the avatar.
  // The call is memoized per request via React.cache() so there is no extra DB round-trip.
  const ctx = await requireSession();
  const { user } = ctx;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky header */}
      <header
        className="sticky top-0 z-50 flex h-14 items-center bg-background border-b border-border"
        style={{ height: '56px' }}
      >
        {/* Hamburger — left */}
        <button
          type="button"
          aria-label="Open navigation"
          className="flex h-14 w-14 items-center justify-center text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {/* Hamburger icon — three horizontal lines */}
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 5H17M3 10H17M3 15H17"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* "Finance" title — centered absolutely so it doesn't shift with side content */}
        <div className="absolute inset-x-0 flex justify-center pointer-events-none">
          <span className="font-body text-foreground" style={{ fontSize: '16px', fontWeight: 500 }}>
            Finance
          </span>
        </div>

        {/* Avatar link to /profile — right */}
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

      {/* Page content */}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
