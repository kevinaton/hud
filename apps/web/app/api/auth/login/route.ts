/**
 * POST /api/auth/login
 *
 * Flow:
 *  1. Parse + validate body (Zod)
 *  2. Check IP rate limit → 429 if exceeded
 *  3. Verify Origin header (CSRF-exempt route uses origin check instead)
 *  4. Look up user by email; if not found → constant-time dummy verify → 401
 *  5. Check account lockout → 401 if locked
 *  6. Verify password
 *  7. On failure: recordFailedAttempt, write audit login_fail, return 401
 *  8. On success: clearLockout, rotateSession, set cookies, write audit login, return 200
 *
 * Timing: failure path takes ≥ 200ms (argon2 verify handles most of this;
 * we pad with a minimum delay to cover the "user not found" fast path).
 */

import { writeAuditLog } from '@/lib/audit/index';
import { setCsrfCookie, setSessionCookie } from '@/lib/auth/cookie';
import { getSessionToken } from '@/lib/auth/cookie';
import { generateCsrfToken, verifyOrigin } from '@/lib/auth/csrf';
import {
  LOCKOUT_DURATION_MINUTES,
  LOCKOUT_THRESHOLD,
  checkLockout,
  clearLockout,
  recordFailedAttempt,
} from '@/lib/auth/lockout';
import { DUMMY_HASH, MIN_PASSWORD_LENGTH, verifyPassword } from '@/lib/auth/password';
import { checkLoginRateLimit, resetLoginRateLimit } from '@/lib/auth/rate-limit';
import { rotateSession } from '@/lib/auth/session';
import { db } from '@/lib/db/index';
import { users } from '@hud/db';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const MIN_RESPONSE_MS = 200;

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  async function padAndReturn(res: NextResponse): Promise<NextResponse> {
    const elapsed = Date.now() - start;
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
    }
    return res;
  }

  const ip = getIp(req);
  const userAgent = req.headers.get('user-agent') ?? '';

  // 1. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return padAndReturn(NextResponse.json({ error: 'Invalid request body' }, { status: 400 }));
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return padAndReturn(NextResponse.json({ error: 'Invalid credentials' }, { status: 400 }));
  }

  const { email, password } = parsed.data;

  // 2. IP rate limit
  const rateResult = await checkLoginRateLimit(ip);
  if (!rateResult.allowed) {
    const res = NextResponse.json(
      { error: 'Too many login attempts. Try again later.' },
      { status: 429 },
    );
    res.headers.set('Retry-After', String(rateResult.retryAfterSeconds));
    return res;
  }

  // 3. Origin check (CSRF substitute for login route)
  if (!verifyOrigin(req.headers)) {
    return padAndReturn(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
  }

  // 4. Look up user by email
  const user = db.select().from(users).where(eq(users.email, email)).get();

  if (!user) {
    // Constant-time: perform dummy verify to prevent timing oracle
    await verifyPassword(password, DUMMY_HASH).catch(() => null);
    return padAndReturn(
      NextResponse.json(
        {
          error: 'Invalid credentials',
          failedAttempts: 0,
          remainingAttempts: LOCKOUT_THRESHOLD,
        },
        { status: 401 },
      ),
    );
  }

  // 5. Check account lockout
  const lockout = checkLockout(user.id);
  if (lockout.locked) {
    return padAndReturn(
      NextResponse.json(
        {
          error: 'Invalid credentials',
          failedAttempts: user.failedAttempts,
          remainingAttempts: 0,
          lockedUntil: lockout.lockedUntil.toISOString(),
        },
        { status: 401 },
      ),
    );
  }

  // 6. Verify password
  const valid = await verifyPassword(password, user.passwordHash).catch(() => false);

  if (!valid) {
    // 7. Record failed attempt (DB writes in transaction with audit)
    const newCount = db.transaction((tx) => {
      const count = recordFailedAttempt(tx, user.id);

      // Write login_fail audit
      writeAuditLog(tx, {
        userId: user.id,
        actor: 'anon',
        action: 'login_fail',
        entity: 'user',
        entityId: String(user.id),
        payload: {
          email_attempted: email,
          reason: 'wrong_password',
          failed_attempts: count,
        },
        ipAddress: ip,
        userAgent,
      });

      // If account just hit lockout threshold, write lockout audit too
      if (count >= LOCKOUT_THRESHOLD) {
        const lockedUntilTs = new Date(
          Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
        ).toISOString();
        writeAuditLog(tx, {
          userId: user.id,
          actor: 'anon',
          action: 'lockout',
          entity: 'user',
          entityId: String(user.id),
          payload: {
            locked_until: lockedUntilTs,
            failed_attempts: count,
          },
          ipAddress: ip,
          userAgent,
        });
      }

      return count;
    });

    // Re-read lockout state after recording failure
    const updatedUser = db.select().from(users).where(eq(users.id, user.id)).get();
    const remainingAttempts = Math.max(0, LOCKOUT_THRESHOLD - newCount);
    const responseBody: Record<string, unknown> = {
      error: 'Invalid credentials',
      failedAttempts: newCount,
      remainingAttempts,
    };
    if (updatedUser?.lockedUntil) {
      responseBody.lockedUntil = updatedUser.lockedUntil;
    }

    return padAndReturn(NextResponse.json(responseBody, { status: 401 }));
  }

  // 8. Success path
  // Read existing session token for rotation (may be undefined)
  const oldToken = await getSessionToken();

  const { plainToken } = db.transaction((tx) => {
    // Clear lockout state
    clearLockout(tx, user.id);

    // Rotate session (delete old, create new)
    const sessionResult = rotateSession(tx, oldToken, user.id, { ipAddress: ip, userAgent });

    // Write login audit
    const emailHint = email.replace(/^(.).*@/, '$1***@');
    writeAuditLog(tx, {
      userId: user.id,
      actor: 'user',
      action: 'login',
      entity: 'session',
      entityId: sessionResult.session.id,
      payload: { email_hint: emailHint },
      ipAddress: ip,
      userAgent,
    });

    return sessionResult;
  });

  // Reset IP rate limit on successful login
  await resetLoginRateLimit(ip);

  // Set session + CSRF cookies
  await setSessionCookie(plainToken);
  const csrfToken = generateCsrfToken();
  await setCsrfCookie(csrfToken);

  return NextResponse.json({ redirect: '/' }, { status: 200 });
}
