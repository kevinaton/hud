/**
 * GET /api/auth/csrf
 *
 * Issues a fresh CSRF token, sets it in the cookie, and returns it in the body.
 * Used by client-side code that needs a CSRF token but was not rendered from a page.
 */

import { setCsrfCookie } from '@/lib/auth/cookie';
import { generateCsrfToken } from '@/lib/auth/csrf';
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  const token = generateCsrfToken();
  await setCsrfCookie(token);
  return NextResponse.json({ csrfToken: token });
}
