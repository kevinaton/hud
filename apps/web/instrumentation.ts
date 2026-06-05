/**
 * Next.js instrumentation hook.
 * Runs once when the server is first initialized.
 *
 * Initializes Sentry (no-op when SENTRY_DSN is absent).
 * beforeSend scrubs request bodies on /api/auth/* routes
 * so passwords never appear in Sentry events.
 */

import type { ErrorEvent } from '@sentry/nextjs';
import * as Sentry from '@sentry/nextjs';

/** Scrub sensitive data from Sentry events for auth routes. */
function scrubAuthEvent(event: ErrorEvent): ErrorEvent | null {
  if (!event.request?.url?.includes('/api/auth/')) return event;

  if (event.request.data) {
    event.request.data = '[Scrubbed — auth route]';
  }

  if (event.request.cookies) {
    event.request.cookies = {};
  }

  if (event.request.headers) {
    const headers = event.request.headers as Record<string, string>;
    const scrubbed: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      const lower = k.toLowerCase();
      const isSensitive =
        lower === 'cookie' || lower === 'x-csrf-token' || lower === 'authorization';
      scrubbed[k] = isSensitive ? '[Scrubbed]' : v;
    }
    event.request.headers = scrubbed;
  }

  return event;
}

export async function register() {
  const dsn = process.env.SENTRY_DSN;

  // If no DSN is set, skip initialization (dev / test environments)
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    environment: process.env.NODE_ENV ?? 'development',
    beforeSend: scrubAuthEvent,
  });
}
