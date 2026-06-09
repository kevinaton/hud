/**
 * lib/auth/lockout-constants.ts
 *
 * Pure constants for the account-lockout policy, split out from
 * `lib/auth/lockout.ts` so they can be imported from client components
 * (e.g. `_LoginForm.tsx`) without pulling in `better-sqlite3` / Drizzle,
 * which cannot be bundled for the browser.
 *
 * `lockout.ts` re-exports these for server-side callers — import from
 * either module; this is the single source of truth for the values.
 */

export const LOCKOUT_THRESHOLD = 3;
export const LOCKOUT_DURATION_MINUTES = 15;
