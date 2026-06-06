/**
 * GET  /api/profile — return current user's username (displayName), email, avatarPath
 * PUT  /api/profile — update displayName and/or email; Zod-validated; session+CSRF guarded
 *
 * Guards (PUT):
 *   1. requireSession('response')  → 401 if not authenticated
 *   2. CSRF token verification     → 403 if missing/invalid
 *   3. Zod validation of body      → 400 with field errors
 *   4. updateUserProfile (DB)      → atomic update + audit_log
 */

import { getCsrfCookieValue } from '@/lib/auth/cookie';
import { extractCsrfFromRequest, verifyCsrfToken } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/index';
import { updateUserProfile } from '@/lib/db/users';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

// ---------------------------------------------------------------------------
// GET /api/profile
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSession('response');
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { user } = ctx;

  return NextResponse.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    avatarPath: user.avatarPath ?? null,
  });
}

// ---------------------------------------------------------------------------
// PUT /api/profile
// ---------------------------------------------------------------------------
const updateProfileSchema = z.object({
  displayName: z.string().min(1, 'Username is required').max(100).optional(),
  email: z.string().email('Must be a valid email address').toLowerCase().optional(),
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
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { displayName, email } = parsed.data;

  // Must provide at least one field to update
  if (displayName === undefined && email === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // 5. DB update + audit
  try {
    const updated = updateUserProfile(
      ctx.userId,
      { displayName, email },
      { actor: 'user', ipAddress: ip, userAgent },
    );

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName ?? null,
      avatarPath: updated.avatarPath ?? null,
    });
  } catch (err) {
    // SQLite UNIQUE constraint on email
    if (err instanceof Error && err.message.toLowerCase().includes('unique')) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }
    throw err;
  }
}
