/**
 * POST /api/auth/logout
 *
 * Flow:
 *  1. Read session cookie
 *  2. Verify CSRF token (X-CSRF-Token header vs hud_csrf cookie)
 *  3. Destroy session in DB
 *  4. Write audit logout
 *  5. Clear session + CSRF cookies
 *  6. Return 200
 *
 * Note: if no valid session exists, we still clear cookies and return 200
 * (idempotent — already logged out).
 */

import { writeAuditLog } from '@/lib/audit/index';
import {
  clearCsrfCookie,
  clearSessionCookie,
  getCsrfCookieValue,
  getSessionToken,
} from '@/lib/auth/cookie';
import { extractCsrfFromRequest, verifyCsrfToken } from '@/lib/auth/csrf';
import { getSession } from '@/lib/auth/session';
import { destroySession } from '@/lib/auth/session';
import { db } from '@/lib/db/index';
import { type NextRequest, NextResponse } from 'next/server';

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getIp(req);
  const userAgent = req.headers.get('user-agent') ?? '';

  // 1. Read session token
  const token = await getSessionToken();

  // 2. CSRF check
  const csrfCookie = await getCsrfCookieValue();
  const csrfHeader = extractCsrfFromRequest(req.headers);
  if (!verifyCsrfToken(csrfCookie, csrfHeader)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  // 3 & 4. Destroy session + write audit (if session exists)
  if (token) {
    const sessionData = getSession(token);

    if (sessionData) {
      db.transaction((tx) => {
        writeAuditLog(tx, {
          userId: sessionData.user.id,
          actor: 'user',
          action: 'logout',
          entity: 'session',
          entityId: sessionData.session.id,
          payload: {},
          ipAddress: ip,
          userAgent,
        });
      });

      destroySession(token);
    }
  }

  // 5. Clear cookies
  await clearSessionCookie();
  await clearCsrfCookie();

  return NextResponse.json({ ok: true }, { status: 200 });
}
