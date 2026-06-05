/**
 * Signup page — Server Component.
 *
 * Returns 404 if HUD_ALLOW_SIGNUP is not 'true' or 'once'.
 * If 'once' and users already exist, returns 404.
 */

import { GridOverlay } from '@/components/hud/GridOverlay';
import { db } from '@/lib/db/index';
import { users } from '@hud/db';
import { sql } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { SignupForm } from './_SignupForm';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const allowSignup = process.env.HUD_ALLOW_SIGNUP;

  if (!allowSignup || allowSignup === 'false') {
    notFound();
  }

  if (allowSignup === 'once') {
    const result = db.select({ count: sql<number>`count(*)` }).from(users).get();
    if ((result?.count ?? 0) > 0) {
      notFound();
    }
  }

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
            Create account
          </p>
        </div>

        {/* Separator */}
        <div className="border-t border-border" />

        {/* Signup form */}
        <SignupForm />

        {/* Back to login */}
        <a
          href="/login"
          className="font-body text-muted transition-colors hover:text-foreground"
          style={{ fontSize: '12px', letterSpacing: '0.06em' }}
        >
          Already have an account? Log in
        </a>
      </div>
    </main>
  );
}
