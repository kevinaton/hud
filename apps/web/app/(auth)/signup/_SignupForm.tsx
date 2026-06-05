'use client';

/**
 * SignupForm — client component.
 * Only rendered when HUD_ALLOW_SIGNUP=true (checked server-side).
 *
 * Fetches a CSRF token from GET /api/auth/csrf on mount (the Route Handler
 * is allowed to set cookies; RSC render is not, per Next.js 15).
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function SignupForm() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!csrfToken) return;
    setPending(true);
    setError(null);

    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const displayName = (form.elements.namedItem('displayName') as HTMLInputElement).value;
    const csrf = csrfToken;

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({ email, password, displayName: displayName || undefined }),
      });

      const data = (await res.json()) as { error?: string; redirect?: string };

      if (res.ok) {
        router.push(data.redirect ?? '/');
        router.refresh();
        return;
      }

      setError(data.error ?? 'Signup failed');
    } catch {
      setError('Network error — please try again');
    } finally {
      setPending(false);
    }
  }

  return (
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
          disabled={pending || !csrfToken}
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
          <span className="ml-2 normal-case text-muted-2" style={{ fontSize: '10px' }}>
            (min 12 chars)
          </span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          disabled={pending || !csrfToken}
          className="border border-border bg-transparent px-3 py-2 font-body text-foreground outline-none focus:border-accent disabled:opacity-50"
          style={{ fontSize: '14px', borderRadius: 'var(--radius)' }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="displayName"
          className="font-body uppercase text-muted"
          style={{ fontSize: '11px', letterSpacing: '0.18em' }}
        >
          Display Name
          <span className="ml-2 normal-case text-muted-2" style={{ fontSize: '10px' }}>
            (optional)
          </span>
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          disabled={pending || !csrfToken}
          className="border border-border bg-transparent px-3 py-2 font-body text-foreground outline-none focus:border-accent disabled:opacity-50"
          style={{ fontSize: '14px', borderRadius: 'var(--radius)' }}
        />
      </div>

      {error && (
        <div role="alert" className="font-body text-destructive" style={{ fontSize: '13px' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !csrfToken}
        className="mt-2 border border-accent bg-transparent px-6 py-2 font-display uppercase text-accent transition-colors hover:bg-accent hover:text-accent-fg disabled:cursor-not-allowed disabled:opacity-40"
        style={{ fontSize: '13px', letterSpacing: '0.18em' }}
      >
        {pending ? 'Creating account...' : 'Create Account'}
      </button>
    </form>
  );
}
