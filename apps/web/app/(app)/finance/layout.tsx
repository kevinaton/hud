/**
 * app/(app)/finance/layout.tsx
 *
 * Finance section shell — sticky header with hamburger (left) and "Finance" title (center).
 * Auth is enforced by the parent (app)/layout.tsx via requireSession().
 *
 * Header spec (per hud-ui skill):
 *   - Height: 56px
 *   - Background: --surface with --border bottom border
 *   - Hamburger: left, aria-label="Open navigation"
 *   - "Finance" title: center, Oxanium 500 16px
 */

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Sticky header */}
      <header
        className="sticky top-0 z-30 flex h-14 items-center"
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
      </header>

      {/* Page content */}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
