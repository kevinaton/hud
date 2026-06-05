/**
 * POST /api/auth/signup
 *
 * Env-gated: HUD_ALLOW_SIGNUP must be 'true' or 'once'.
 * If 'once' and users table non-empty → 404.
 *
 * Flow:
 *  1. Env gate check → 404 if not allowed
 *  2. IP rate limit → 429 if exceeded
 *  3. Origin header check (CSRF substitute for pre-session route)
 *  4. Parse + validate body (Zod)
 *  5. Check email uniqueness → 409 if taken
 *  6. Hash password (argon2id)
 *  7. DB transaction: insert user + create session + write audit signup
 *  8. Set cookies (session + CSRF)
 *  9. Return 201 with redirect
 */

import { writeAuditLog } from '@/lib/audit/index';
import { setCsrfCookie, setSessionCookie } from '@/lib/auth/cookie';
import { generateCsrfToken, verifyOrigin } from '@/lib/auth/csrf';
import { MIN_PASSWORD_LENGTH, hashPassword } from '@/lib/auth/password';
import { checkSignupRateLimit } from '@/lib/auth/rate-limit';
import { createSession } from '@/lib/auth/session';
import { db } from '@/lib/db/index';
import { users } from '@hud/db';
import { eq, sql } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/** Returns true if the string contains no ASCII control characters (0x00–0x1F or 0x7F). */
function hasNoControlChars(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 32;
    if (cp < 32 || cp === 127) return false;
  }
  return true;
}

const signupSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
  displayName: z
    .string()
    .min(1)
    .max(60)
    .refine(hasNoControlChars, 'No control characters')
    .optional(),
});

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Env gate
  const allowSignup = process.env.HUD_ALLOW_SIGNUP;
  if (!allowSignup || allowSignup === 'false') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (allowSignup === 'once') {
    const result = db.select({ count: sql<number>`count(*)` }).from(users).get();
    if ((result?.count ?? 0) > 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const ip = getIp(req);
  const userAgent = req.headers.get('user-agent') ?? '';

  // 2. IP rate limit
  const rateResult = await checkSignupRateLimit(ip);
  if (!rateResult.allowed) {
    const res = NextResponse.json(
      { error: 'Too many signup attempts. Try again later.' },
      { status: 429 },
    );
    res.headers.set('Retry-After', String(rateResult.retryAfterSeconds));
    return res;
  }

  // 3. Origin check
  if (!verifyOrigin(req.headers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 4. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
      { status: 400 },
    );
  }

  const { email, password, displayName } = parsed.data;

  // 5. Email uniqueness check
  const existing = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  // 6. Hash password
  const passwordHash = await hashPassword(password);

  // 7. Transaction: insert user + session + audit
  const { plainToken } = db.transaction((tx) => {
    const newUser = tx
      .insert(users)
      .values({
        email,
        passwordHash,
        displayName: displayName ?? null,
      })
      .returning()
      .get();

    if (!newUser) throw new Error('Failed to create user');

    const sessionResult = createSession(tx, newUser.id, { ipAddress: ip, userAgent });

    writeAuditLog(tx, {
      userId: newUser.id,
      actor: 'anon',
      action: 'signup',
      entity: 'user',
      entityId: String(newUser.id),
      payload: { email_hint: email.replace(/^(.).*@/, '$1***@') },
      ipAddress: ip,
      userAgent,
    });

    return sessionResult;
  });

  // 8. Set cookies
  await setSessionCookie(plainToken);
  const csrfToken = generateCsrfToken();
  await setCsrfCookie(csrfToken);

  return NextResponse.json({ redirect: '/' }, { status: 201 });
}
