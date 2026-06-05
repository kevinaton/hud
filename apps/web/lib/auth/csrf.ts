/**
 * lib/auth/csrf.ts
 *
 * CSRF double-submit token.
 *
 * Strategy:
 *   1. Server generates a random CSRF token and sets it in a non-httpOnly cookie.
 *   2. Client reads the cookie and sends the same value in the X-CSRF-Token header
 *      (or a hidden form field named "csrf").
 *   3. Server compares cookie value to the submitted header/field.
 *      Mismatch → 403 Forbidden.
 *
 * Note: /api/auth/login and /api/auth/signup are EXEMPT from CSRF verification
 * (no prior session exists to carry the token). They do require Origin header check.
 *
 * SameSite=Lax is also a CSRF defense. This double-submit is belt-and-suspenders.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generate a random CSRF token (128-bit, base64url).
 */
export function generateCsrfToken(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Verify that the submitted CSRF token matches the cookie value.
 * Uses timingSafeEqual to prevent timing attacks.
 *
 * Returns true if valid, false if invalid or missing.
 */
export function verifyCsrfToken(
  cookieValue: string | undefined,
  submittedValue: string | undefined,
): boolean {
  if (!cookieValue || !submittedValue) return false;
  if (cookieValue.length !== submittedValue.length) return false;

  const a = Buffer.from(cookieValue, 'utf-8');
  const b = Buffer.from(submittedValue, 'utf-8');

  // timingSafeEqual requires equal-length buffers
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Extract the CSRF token from a request.
 * Checks X-CSRF-Token header first, then the 'csrf' field from a parsed body.
 */
export function extractCsrfFromRequest(
  headers: Headers,
  body?: Record<string, unknown>,
): string | undefined {
  return (
    headers.get('X-CSRF-Token') ??
    headers.get('x-csrf-token') ??
    (typeof body?.csrf === 'string' ? body.csrf : undefined)
  );
}

/**
 * Verify the Origin header matches the expected host.
 * Used on login/signup routes that are CSRF-exempt but still check origin.
 */
export function verifyOrigin(headers: Headers): boolean {
  const origin = headers.get('Origin');
  const host = headers.get('Host');

  // In dev there may be no origin on same-origin requests — allow through
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}
