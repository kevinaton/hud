/**
 * Login page — Server Component shell.
 *
 * Figma node-id=305-2391:
 *   Pure black background, GridOverlay, centered card ~400px wide,
 *   HUD logotype above form, WarningCounter wired to failed-attempt count,
 *   Orbitron numerics, cyan accent.
 *
 * The CSRF cookie is set by GET /api/auth/csrf, fetched client-side on mount
 * inside LoginForm. RSC render cannot set cookies in Next.js 15.
 */

import { GridOverlay } from '@/components/hud/GridOverlay';
import { LoginForm } from './_LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background">
      <GridOverlay />

      <div
        className="relative z-10 flex w-full flex-col gap-10"
        style={{ maxWidth: '400px', padding: '0 24px' }}
      >
        {/* HUD logotype */}
        <div>
          <h1
            className="font-display text-foreground"
            style={{ fontSize: '48px', fontWeight: 400, letterSpacing: '0.08em' }}
          >
            HUD
          </h1>
          <p
            className="font-body uppercase text-muted"
            style={{ fontSize: '11px', letterSpacing: '0.18em' }}
          >
            Authorized personnel only
          </p>
        </div>

        {/* Separator */}
        <div className="border-t border-border" />

        {/* Form with WarningCounter */}
        <LoginForm />
      </div>
    </main>
  );
}
