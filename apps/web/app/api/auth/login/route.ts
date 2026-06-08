/**
 * POST /api/auth/login
 *
 * Flow:
 *  1. Parse body as JSON; coerce email/password to strings (never schema-reject —
 *     see "Why no Zod format/length gate" below)
 *  2. Check IP rate limit → 429 if exceeded
 *  3. Verify Origin header (CSRF-exempt route uses origin check instead)
 *  4. Look up user by (normalized) email
 *     - not found → constant-time dummy verify, write a real login_fail audit
 *       row (userId: null), return 401 with remainingAttempts = LOCKOUT_THRESHOLD
 *     - found → continue
 *  5. Check account lockout → 401 if locked
 *  6. Verify password
 *  7. On failure: recordFailedAttempt, write audit login_fail, return 401
 *  8. On success: clearLockout, rotateSession, set cookies, write audit login, return 200
 *
 * Timing: failure path takes ≥ 200ms (argon2 verify handles most of this;
 * we pad with a minimum delay to cover the "user not found" fast path).
 *
 * --- Why no Zod `.email()` / `.min(MIN_PASSWORD_LENGTH)` gate here (Ticket 30) ---
 *
 * Earlier versions validated `email`/`password` shape with Zod *before* doing
 * anything else, and returned a bare `{ error: 'Invalid credentials' }` (400,
 * no `remainingAttempts`, no DB write, no audit row) on any schema-validation
 * failure. That meant a 1-character password, an empty field, or a malformed
 * email silently bypassed the entire wrong-credential recording machinery —
 * the lockout counter never moved, no `audit_log` row was written, and the
 * `WarningCounter` on the login form had nothing to display.
 *
 * Per Kevin's explicit correction (2026-06-07): "regardless if user only add
 * 1 character or accidentally click authenticate flag it as wrong credential
 * not only the 12+ character." There is therefore deliberately NO format or
 * length validation gate on this route — *any* string value for email/password
 * (including empty string, 1 char, garbage) is treated as a real credential
 * submission and flows through the SAME constant-time wrong-credential path
 * (dummy-verify-and-record for unknown emails; lockout-check → argon2.verify
 * → recordFailedAttempt for known emails) as a normal wrong password.
 *
 * `MIN_PASSWORD_LENGTH` remains the signup/hashing-side minimum (enforced when
 * *creating* a password — see lib/auth/password.ts) — it is a password-quality
 * rule, not a login-input gate, and was never a meaningful security boundary on
 * the login path (argon2.verify cost is dominated by its memory/time params,
 * not candidate length, so a short candidate is exactly as expensive — and as
 * safe to check — as a long one).
 *
 * The only structural pre-lookup rejection that remains is "request body isn't
 * parseable JSON" (line below) — that's not a credential submission (there is
 * no email/password to record against), so it cannot participate in the
 * lockout/audit machinery; it returns 400 with no `remainingAttempts` by design.
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
import { DUMMY_HASH, verifyPassword } from '@/lib/auth/password';
import { checkLoginRateLimit, resetLoginRateLimit } from '@/lib/auth/rate-limit';
import { rotateSession } from '@/lib/auth/session';
import { db } from '@/lib/db/index';
import { users } from '@hud/db';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const MIN_RESPONSE_MS = 200;

/**
 * Deliberately permissive: coerces any input to a string (non-strings become
 * `''`), with NO format or length validation. See the module-level comment for
 * why — every credential shape must flow into the recorded wrong-credential
 * path, not bail out early as "malformed request."
 */
const loginInputSchema = z.object({
  email: z.unknown().transform((v) => (typeof v === 'string' ? v : '')),
  password: z.unknown().transform((v) => (typeof v === 'string' ? v : '')),
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

  // Deliberately permissive — never rejects on shape. See module-level comment
  // for why: every (email, password) pair, however malformed, must flow into
  // the recorded wrong-credential path below, not bail out as "bad request."
  const { email: rawEmail, password } = loginInputSchema.parse(body);
  const email = rawEmail.trim().toLowerCase();

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

    // No account exists for this email, so there is no failed_attempts counter
    // to decrement and no lockout state to update — but this is still a real
    // wrong-credential submission and MUST be recorded as one (Ticket 30 AC:
    // "This applies whether or not the submitted email corresponds to an
    // existing account"). Write a real login_fail audit row with userId: null
    // (audit_log.user_id is nullable for exactly this pre-auth case — see
    // .claude/skills/hud-audit/SKILL.md).
    db.transaction((tx) => {
      writeAuditLog(tx, {
        userId: null,
        actor: 'anon',
        action: 'login_fail',
        entity: 'user',
        // No row exists for this email — there is nothing to point entityId at.
        payload: {
          email_attempted: email,
          reason: 'no_such_account',
        },
        ipAddress: ip,
        userAgent,
      });
    });

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
