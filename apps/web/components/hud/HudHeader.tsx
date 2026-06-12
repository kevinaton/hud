'use client';

/**
 * HudHeader — top-level navigation header, shared across all (app)/ pages.
 *
 * Desktop (md+):
 *   [HUD wordmark] [Finance] [Logs] [Nexus]  ···  [Avatar]
 *
 * Mobile (< md):
 *   [☰ drawer]  [Section title]  [Avatar]
 *
 * The hamburger / drawer (AppNavDrawer) handles the mobile slide-in nav.
 * Active state is derived from usePathname — no prop needed.
 */

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppNavDrawer } from './AppNavDrawer';
import { AvatarDisplay } from './AvatarDisplay';

const TOP_NAV = [
  { label: 'Finance', href: '/finance/cashflow', match: '/finance' },
  { label: 'Logs', href: '/logs', match: '/logs' },
  { label: 'Nexus', href: '/nexus', match: '/nexus' },
] as const;

interface HudHeaderProps {
  avatarPath: string | null;
  displayName: string | null;
  email: string;
}

export function HudHeader({ avatarPath, displayName, email }: HudHeaderProps) {
  const pathname = usePathname();

  const sectionLabel =
    TOP_NAV.find((n) => pathname.startsWith(n.match))?.label ?? 'HUD';

  return (
    <header className="sticky top-0 z-50 h-14 bg-background border-b border-border">
      <div className="relative flex h-full items-center">

        {/* ── Mobile: hamburger drawer trigger ── */}
        <div className="md:hidden">
          <AppNavDrawer currentPath={pathname} />
        </div>

        {/* ── Desktop: HUD wordmark ── */}
        <Link
          href="/finance/cashflow"
          aria-label="HUD home"
          className="hidden md:flex h-full items-center px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="font-display text-[13px] uppercase tracking-[0.2em] text-accent">
            HUD
          </span>
        </Link>

        {/* ── Desktop: main nav ── */}
        <nav
          aria-label="Main navigation"
          className="hidden md:flex items-center h-full ml-2"
        >
          {TOP_NAV.map((item) => {
            const isActive = pathname.startsWith(item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex items-center h-full px-4 font-body text-[14px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive ? 'text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── Mobile: section title (centered) ── */}
        <div className="md:hidden absolute inset-x-0 flex justify-center pointer-events-none">
          <span className="font-body text-[16px] font-medium text-foreground">
            {sectionLabel}
          </span>
        </div>

        {/* ── Avatar: right side, all screens ── */}
        <div className="ml-auto pr-3">
          <Link
            href="/profile"
            aria-label="Go to profile"
            className="flex items-center justify-center rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <AvatarDisplay
              avatarPath={avatarPath}
              displayName={displayName}
              email={email}
              size={32}
            />
          </Link>
        </div>

      </div>
    </header>
  );
}
