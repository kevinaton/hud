/**
 * app/api/logs/settings/route.ts
 *
 * POST /api/logs/settings — update logs settings
 *
 * Body: { approvalRequired: boolean }
 *
 * Guards: session, CSRF, Zod.
 */

import { getCsrfCookieValue } from '@/lib/auth/cookie';
import { extractCsrfFromRequest, verifyCsrfToken } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/index';
import { setApprovalRequired } from '@/lib/db/logs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  approvalRequired: z.boolean(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const ctx = await requireSession('response');
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const csrfCookie = await getCsrfCookieValue();
  const csrfSubmitted = extractCsrfFromRequest(
    request.headers,
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : undefined,
  );
  if (!verifyCsrfToken(csrfCookie, csrfSubmitted)) {
    return NextResponse.json({ error: 'CSRF token invalid' }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ipAddress = forwarded ? forwarded.split(',')[0].trim() : undefined;
  const userAgent = request.headers.get('user-agent') ?? undefined;

  try {
    setApprovalRequired(ctx.userId, parsed.data.approvalRequired, {
      userId: ctx.userId,
      actor: 'user',
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ approvalRequired: parsed.data.approvalRequired }, { status: 200 });
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: server-side error logging
    console.error('[api/logs/settings]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
