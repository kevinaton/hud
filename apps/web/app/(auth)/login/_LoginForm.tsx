'use client';

/**
 * LoginForm — client component.
 *
 * Handles:
 *  - Fetching CSRF token from GET /api/auth/csrf on mount (sets cookie + returns token in body)
 *  - Injecting CSRF token into POST header
 *  - Showing remaining-attempts count via WarningCounter (server-driven, not client-side math)
 *  - Showing lockout countdown when account is locked
 *  - Showing error messages from server response
 *  - Redirecting on success
 */

import { WarningCounter } from '@/components/hud/WarningCounter';
import { LOCKOUT_DURATION_MINUTES, LOCKOUT_THRESHOLD } from '@/lib/auth/lockout-constants';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  /**
   * Remaining attempts before lockout, as returned by the server on failure.
   * Always visible — starts at the full threshold on fresh page load (no
   * hide-until-failure: Kevin wants the counter shown from the moment the
   * page loads, decrementing with each wrong attempt).
   */
  const [remainingAttempts, setRemainingAttempts] = useState<number>(LOCKOUT_THRESHOLD);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lockCountdown, setLockCountdown] = useState('');

  // Fetch CSRF token on mount via the Route Handler (which is allowed to set cookies)
  useEffect(() => {
    fetch('/api/auth/csrf')
      .then((res) => res.json())
      .then((data: { csrfToken?: string }) => {
        if (data.csrfToken) setCsrfToken(data.csrfToken);
      })
      .catch(() => {
        // Non-fatal: form will remain disabled; user can refresh
      });
  }, []);

  // Countdown timer while locked
  useEffect(() => {
    if (!isLocked || !lockedUntil) return;

    const tick = () => {
      const remaining = lockedUntil.getTime() - Date.now();
      if (remaining <= 0) {
        setIsLocked(false);
        setLockedUntil(null);
        setLockCountdown('');
        // Lockout has expired — reset to the fresh-state full threshold
        setRemainingAttempts(LOCKOUT_THRESHOLD);
        setError(null);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      setLockCountdown(formatted);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLocked, lockedUntil]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!csrfToken) return;
    setPending(true);
    setError(null);

    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const csrf = csrfToken;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json()) as {
        error?: string;
        failedAttempts?: number;
        remainingAttempts?: number;
        lockedUntil?: string;
        redirect?: string;
      };

      if (res.ok) {
        // Successful login — reset warning state to fresh-state value, then redirect
        setRemainingAttempts(LOCKOUT_THRESHOLD);
        setError(null);
        router.push('/finance/cashflow');
        return;
      }

      if (res.status === 429) {
        setError('Too many attempts. Please wait before trying again.');
      } else if (data.lockedUntil) {
        // Account just locked (or already locked) — start/maintain countdown
        const until = new Date(data.lockedUntil);
        setIsLocked(true);
        setLockedUntil(until);
        setRemainingAttempts(0);
        // Error message is rendered dynamically from lockCountdown state (see JSX below)
        setError('locked');
      } else {
        // Wrong credentials — server returns the authoritative remaining count
        const remaining = data.remainingAttempts ?? LOCKOUT_THRESHOLD;
        setRemainingAttempts(remaining);
        setError(data.error ?? 'Invalid credentials');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setPending(false);
    }
  }

  // Derive the visible error string
  function errorMessage(): string {
    if (error === 'locked') {
      return lockCountdown
        ? `Locked — try again in ${lockCountdown}`
        : `Account locked — try again in ${LOCKOUT_DURATION_MINUTES} minutes`;
    }
    return error ?? '';
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Warning counter — always visible, starting at the full threshold on fresh load */}
      <WarningCounter count={remainingAttempts} label="Attempts Remaining" />

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="font-body text-destructive"
          style={{ fontSize: '13px', letterSpacing: '0.04em' }}
        >
          {errorMessage()}
        </div>
      )}

      {/* Login form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="email"
            className="font-body uppercase text-muted"
            style={{ fontSize: '11px', letterSpacing: '0.18em' }}
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={pending || isLocked || !csrfToken}
            className="border border-border bg-transparent px-3 py-2 font-body text-foreground outline-none focus:border-accent disabled:opacity-50"
            style={{ fontSize: '14px', borderRadius: 'var(--radius)' }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="password"
            className="font-body uppercase text-muted"
            style={{ fontSize: '11px', letterSpacing: '0.18em' }}
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending || isLocked || !csrfToken}
            className="border border-border bg-transparent px-3 py-2 font-body text-foreground outline-none focus:border-accent disabled:opacity-50"
            style={{ fontSize: '14px', borderRadius: 'var(--radius)' }}
          />
        </div>

        <button
          type="submit"
          disabled={pending || isLocked || !csrfToken}
          className="mt-2 border border-accent bg-transparent px-6 py-2 font-display uppercase text-accent transition-colors hover:bg-accent hover:text-accent-fg disabled:cursor-not-allowed disabled:opacity-40"
          style={{ fontSize: '13px', letterSpacing: '0.18em' }}
        >
          {pending ? 'Authenticating...' : 'Authenticate'}
        </button>
      </form>
    </div>
  );
}
