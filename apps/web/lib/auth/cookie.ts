/**
 * lib/auth/cookie.ts
 *
 * Session cookie and CSRF cookie helpers.
 *
 * Cookie name rules:
 *   - Production: __Host-hud_session (requires Secure + Path=/ + no Domain)
 *   - Dev (HTTP): hud_session (no __Host- prefix — requires HTTPS)
 *
 * The SESSION_COOKIE_NAME env var is set appropriately per environment.
 * See .env.example.
 */

import { cookies } from 'next/headers';

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function cookieName(): string {
  return process.env.SESSION_COOKIE_NAME ?? 'hud_session';
}

function csrfCookieName(): string {
  const base = cookieName().replace('hud_session', 'hud_csrf');
  // Strip __Host- prefix for CSRF cookie — it does NOT need to be host-only
  return base.startsWith('__Host-') ? base.replace('__Host-', '') : base;
}

/**
 * Set the session cookie with the opaque token.
 * Called after successful login.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: cookieName(),
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * Clear the session cookie (expire immediately).
 * Called on logout.
 */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: cookieName(),
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Read the raw session token from the incoming request cookies.
 */
export async function getSessionToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(cookieName())?.value;
}

/**
 * Set the CSRF cookie.
 * This cookie is NOT httpOnly so client JS can read it for double-submit.
 */
export async function setCsrfCookie(csrfToken: string): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: csrfCookieName(),
    value: csrfToken,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * Read the CSRF token from the incoming request cookies.
 */
export async function getCsrfCookieValue(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(csrfCookieName())?.value;
}

/**
 * Clear the CSRF cookie.
 */
export async function clearCsrfCookie(): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: csrfCookieName(),
    value: '',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
