/**
 * lib/auth/index.ts
 *
 * requireSession() — the primary session guard.
 *
 * Usage in route handlers:
 *   const ctx = await requireSession();
 *   // ctx.userId, ctx.user, ctx.session
 *
 * Usage in Server Components (layout.tsx):
 *   const ctx = await requireSession(); // throws redirect('/login') if not authenticated
 *
 * This function:
 *   1. Reads the session cookie
 *   2. Looks up sessions row by sha256(token)
 *   3. Checks expiry (and deletes expired sessions)
 *   4. Extends the sliding TTL
 *   5. Returns the SessionContext with user + session
 *
 * If not authenticated:
 *   - In Server Components: calls redirect('/login') (Next.js redirect throws internally)
 *   - In Route Handlers: returns a 401 Response (callers must check)
 */

import { redirect } from 'next/navigation';
import { getSessionToken } from './cookie';
import { extendSession, getSession } from './session';
import type { SessionContext } from './session';

export type { SessionContext };

/**
 * Require an authenticated session.
 *
 * @param mode
 *   'redirect' (default): throws Next.js redirect to /login on failure.
 *     Use in Server Components and layouts.
 *   'response': returns null on failure (caller returns a 401 response).
 *     Use in route handlers.
 */
export async function requireSession(mode?: 'redirect'): Promise<SessionContext>;
export async function requireSession(mode: 'response'): Promise<SessionContext | null>;
export async function requireSession(
  mode: 'redirect' | 'response' = 'redirect',
): Promise<SessionContext | null> {
  const token = await getSessionToken();

  if (!token) {
    if (mode === 'response') return null;
    redirect('/login');
  }

  const result = getSession(token);

  if (!result) {
    if (mode === 'response') return null;
    redirect('/login');
  }

  // Extend sliding TTL
  extendSession(token);

  return {
    userId: result.user.id,
    user: result.user,
    session: result.session,
  };
}

// Re-export commonly needed sub-modules
export * from './token';
export * from './csrf';
