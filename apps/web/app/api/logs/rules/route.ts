/**
 * app/api/logs/rules/route.ts
 *
 * POST /api/logs/rules — upsert a log_rule (auto_approve or ignore)
 *
 * Body: { sender?: string, kind: string, action: 'auto_approve' | 'ignore' }
 *
 * Guards: session, CSRF, Zod.
 */

import { getCsrfCookieValue } from '@/lib/auth/cookie';
import { extractCsrfFromRequest, verifyCsrfToken } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/index';
import { upsertRule } from '@/lib/db/logs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  sender: z.string().max(200).optional(),
  kind: z.string().min(1).max(100),
  action: z.enum(['auto_approve', 'ignore']),
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
    const rule = upsertRule(
      ctx.userId,
      {
        sender: parsed.data.sender ?? null,
        kind: parsed.data.kind,
        action: parsed.data.action,
      },
      {
        userId: ctx.userId,
        actor: 'user',
        ipAddress,
        userAgent,
      },
    );

    return NextResponse.json(
      { id: rule.id, kind: rule.kind, action: rule.action },
      { status: 200 },
    );
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: server-side error logging
    console.error('[api/logs/rules]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
