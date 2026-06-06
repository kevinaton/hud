/**
 * PUT /api/profile/password
 *
 * Change the authenticated user's password.
 *
 * Flow:
 *   1. requireSession('response')   → 401 if not authenticated
 *   2. CSRF token verification      → 403 if missing/invalid
 *   3. Zod validation of body       → 400 if invalid
 *   4. Verify current password with argon2   → 400 if wrong
 *   5. Hash new password + update users row + write audit_log (in one transaction)
 *
 * Ticket AC:
 *   - Current password verified before update
 *   - New password ≥ 8 characters
 *   - New password and confirmation must match
 *   - payload_json = { "field": "password" } — no hash in payload
 */

import { getCsrfCookieValue } from '@/lib/auth/cookie';
import { extractCsrfFromRequest, verifyCsrfToken } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/index';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getUserById } from '@/lib/db/users';
import { updateUserPassword } from '@/lib/db/users';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirmation is required'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const ip = getIp(req);
  const userAgent = req.headers.get('user-agent') ?? '';

  // 1. Session check
  const ctx = await requireSession('response');
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 3. CSRF check
  const csrfCookie = await getCsrfCookieValue();
  const csrfHeader = extractCsrfFromRequest(req.headers, body as Record<string, unknown>);
  if (!verifyCsrfToken(csrfCookie, csrfHeader)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  // 4. Zod validation
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  // 5. Verify current password
  const user = getUserById(ctx.userId);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash).catch(() => false);
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
  }

  // 6. Hash new password + update + audit (inside updateUserPassword transaction)
  const newHash = await hashPassword(newPassword);

  updateUserPassword(ctx.userId, newHash, { actor: 'user', ipAddress: ip, userAgent });

  return NextResponse.json({ ok: true });
}
