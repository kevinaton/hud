/**
 * lib/auth/anon-lockout.ts
 *
 * Per-IP "no-account" failed-attempt tracker — Ticket 30 (reopened 2026-06-08).
 *
 * --- Why this exists ---
 *
 * The per-account lockout in `lib/auth/lockout.ts` decrements/locks against a
 * `users` row (`failed_attempts`, `locked_until`). That works perfectly when
 * the submitted email matches a real account. But when it does NOT — a typo'd
 * email, an empty field, or any "accidental click of Authenticate" — there is
 * no DB row to decrement or lock. The route's first fix for Ticket 30 (commit
 * `257df9c`) recorded those submissions as real `audit_log` rows but left
 * `remainingAttempts` hard-coded at `LOCKOUT_THRESHOLD` for that branch — so
 * the on-screen counter never visibly moved off "3" and could never reach
 * "locked" for a non-matching email. That is exactly the scenario Kevin
 * reported reproducing live on 2026-06-08 ("when I try to just click the
 * authenticate the 3 didn't change to 2... all invalid credentials will
 * decrement the 3 attempts chance").
 *
 * Kevin's instruction draws zero distinction by account existence: EVERY
 * invalid submission must visibly decrement the displayed counter and
 * contribute to a visible lockout, identically, whether or not the email
 * matches a real account.
 *
 * --- The mechanism ---
 *
 * A per-IP, in-memory counter — the same storage model already used by
 * `lib/auth/rate-limit.ts` (memory store at MVP, Redis-ready interface for
 * Phase 1; see hud-auth skill "Rate limit" section) — that mirrors the
 * per-account lockout's threshold/window/lockout semantics EXACTLY:
 *
 *   - LOCKOUT_THRESHOLD (3) consecutive recorded failures from the same IP,
 *     where NONE of those failures matched a real account, locks that IP's
 *     "anonymous" counter for LOCKOUT_DURATION_MINUTES (15) — same constants,
 *     same shape (`{ locked, lockedUntil }`) as `checkLockout`/`recordFailedAttempt`.
 *   - The route consults this tracker ONLY on the "no such account" branch —
 *     known accounts continue to use the authoritative per-account DB counter
 *     (`lib/auth/lockout.ts`), unchanged. This keeps the real per-account
 *     lockout as the single source of truth for accounts that exist (no risk
 *     of this in-memory layer ever weakening or double-counting that path),
 *     while making the *displayed* behavior for non-matching emails uniform
 *     with it.
 *   - A successful login from an IP clears that IP's anonymous counter (mirrors
 *     `clearLockout` clearing the per-account counter on success) — `resetIp`.
 *
 * --- Why per-IP, not per-account, for this branch ---
 *
 * There is no account to key on — that is the entire problem this module
 * solves. Per-IP is the natural analogue: it's already the dimension
 * `lib/auth/rate-limit.ts` uses for the login-attempt rate limiter, it
 * requires no new cookie/session machinery on a route that is explicitly
 * pre-session (login), and it produces the exact uniform 3 → 2 → 1 → locked
 * sequence Kevin is watching for when he repeatedly clicks "Authenticate"
 * from one browser (one IP) with non-matching credentials.
 *
 * --- Security note: this CLOSES an account-enumeration oracle ---
 *
 * Before this change, an attacker could distinguish "this email has an
 * account" from "this email has no account" simply by submitting the same
 * wrong password against it twice and watching whether `remainingAttempts`
 * moved: known accounts decremented (3 → 2), unknown accounts stayed frozen
 * at 3 forever. That is a textbook user-enumeration side channel — exactly
 * the class of bug the generic "Invalid credentials" message and the
 * dummy-verify constant-time path exist to prevent, reintroduced at the
 * counter layer. By making the unknown-account branch decrement through this
 * same-shaped per-IP tracker, the *displayed* sequence is now
 * indistinguishable between "real account, wrong password" and "no such
 * account" — closing that oracle. (Full write-up in the route's module
 * comment and this ticket's Notes.)
 *
 * All operations are synchronous (a plain in-process Map), matching the
 * synchronous style of `lib/auth/lockout.ts` (better-sqlite3 is synchronous;
 * this module has no DB dependency at all — it is intentionally ephemeral,
 * like the rate limiter, and resets on process restart, which is acceptable
 * for an MVP single-user system per the hud-auth skill's memory-store note).
 */

import { LOCKOUT_DURATION_MINUTES, LOCKOUT_THRESHOLD } from './lockout-constants';

interface AnonAttemptState {
  count: number;
  lockedUntil: number | null; // epoch ms, or null if not locked
}

const store = new Map<string, AnonAttemptState>();

function now(): number {
  return Date.now();
}

function getState(ip: string): AnonAttemptState {
  const existing = store.get(ip);
  if (existing) {
    // Lockout window has expired — reset to a fresh state (mirrors the
    // per-account lockout's "locked_until > now" check in checkLockout).
    if (existing.lockedUntil !== null && existing.lockedUntil <= now()) {
      const fresh: AnonAttemptState = { count: 0, lockedUntil: null };
      store.set(ip, fresh);
      return fresh;
    }
    return existing;
  }
  const fresh: AnonAttemptState = { count: 0, lockedUntil: null };
  store.set(ip, fresh);
  return fresh;
}

export interface AnonLockoutCheck {
  locked: boolean;
  lockedUntil: Date | null;
  /** Failures recorded so far in the current (unlocked) window. */
  count: number;
}

/**
 * Check whether this IP's anonymous counter is currently locked.
 * Mirrors `checkLockout`'s return shape and "expired lock = not locked" logic.
 */
export function checkAnonLockout(ip: string): AnonLockoutCheck {
  const state = getState(ip);
  if (state.lockedUntil !== null && state.lockedUntil > now()) {
    return { locked: true, lockedUntil: new Date(state.lockedUntil), count: state.count };
  }
  return { locked: false, lockedUntil: null, count: state.count };
}

export interface AnonAttemptResult {
  /** New failure count after recording this attempt. */
  count: number;
  /** `LOCKOUT_THRESHOLD - count`, floored at 0 — same formula as the per-account path. */
  remainingAttempts: number;
  /** Set the moment `count` reaches `LOCKOUT_THRESHOLD`; null otherwise. */
  lockedUntil: Date | null;
  /** True only on the attempt that newly trips the threshold (for audit `lockout` rows). */
  justLocked: boolean;
}

/**
 * Record one failed "no such account" attempt from this IP.
 *
 * Mirrors `recordFailedAttempt`'s increment-then-maybe-lock semantics exactly:
 * increments the counter, and if it reaches LOCKOUT_THRESHOLD, sets
 * `lockedUntil = now + LOCKOUT_DURATION_MINUTES` in the same call (one
 * atomic update — there is no separate "lock" step to race against, just as
 * the per-account version performs both in one `tx.update`).
 *
 * Synchronous, like every other lockout primitive in this codebase.
 */
export function recordAnonFailedAttempt(ip: string): AnonAttemptResult {
  const state = getState(ip);

  // Already locked — do not increment further or extend the window (mirrors
  // the per-account "on any failed login while locked_until > now: do not
  // increment counter further; do not extend lockout").
  if (state.lockedUntil !== null && state.lockedUntil > now()) {
    return {
      count: state.count,
      remainingAttempts: 0,
      lockedUntil: new Date(state.lockedUntil),
      justLocked: false,
    };
  }

  const next = state.count + 1;
  const justLocked = next >= LOCKOUT_THRESHOLD;
  const lockedUntilMs = justLocked ? now() + LOCKOUT_DURATION_MINUTES * 60 * 1000 : null;

  store.set(ip, { count: next, lockedUntil: lockedUntilMs });

  return {
    count: next,
    remainingAttempts: Math.max(0, LOCKOUT_THRESHOLD - next),
    lockedUntil: lockedUntilMs !== null ? new Date(lockedUntilMs) : null,
    justLocked,
  };
}

/**
 * Clear an IP's anonymous-attempt state — called on successful login from
 * that IP (mirrors `clearLockout` resetting the per-account counter).
 */
export function resetAnonAttempts(ip: string): void {
  store.delete(ip);
}

/**
 * Test-only escape hatch: wipe all in-memory state between test cases.
 * (The per-account lockout doesn't need this — it's backed by a fresh
 * in-memory SQLite DB per test file. This module's state is process-global,
 * so tests that share a Vitest worker need a way to reset it.)
 */
export function __resetAllAnonAttemptsForTests(): void {
  store.clear();
}
