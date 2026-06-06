/**
 * app/(app)/profile/layout.tsx
 *
 * Profile section shell — matches the Finance section header pattern:
 *   56px sticky header, hamburger left, "Profile" title center.
 * Auth is enforced by the parent (app)/layout.tsx.
 */

import Link from 'next/link';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky header — matches finance/layout.tsx spec */}
      <header
        className="sticky top-0 z-50 flex h-14 items-center bg-background border-b border-border"
        style={{ height: '56px' }}
      >
        {/* Back to Finance — left */}
        <Link
          href="/finance/cashflow"
          aria-label="Back to Finance"
          className="flex h-14 w-14 items-center justify-center text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 4L6 10L12 16"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>

        {/* "Profile" title — centered */}
        <div className="absolute inset-x-0 flex justify-center pointer-events-none">
          <span className="font-body text-foreground" style={{ fontSize: '16px', fontWeight: 500 }}>
            Profile
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
