/**
 * app/api/logs/[id]/reject/route.ts
 *
 * POST /api/logs/:id/reject
 *
 * Rejects a pending log_entry. Body must include a reason string.
 *
 * Guards: session, CSRF, Zod.
 */

import { getCsrfCookieValue } from '@/lib/auth/cookie';
import { extractCsrfFromRequest, verifyCsrfToken } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/index';
import { rejectEntry } from '@/lib/db/logs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const BodySchema = z.object({ reason: z.string().min(1).max(200) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await requireSession('response');
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawParams = await params;
  const parsedParams = ParamsSchema.safeParse(rawParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 });
  }
  const entryId = parsedParams.data.id;

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

  const parsedBody = BodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Validation failed', fieldErrors: parsedBody.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ipAddress = forwarded ? forwarded.split(',')[0].trim() : undefined;
  const userAgent = request.headers.get('user-agent') ?? undefined;

  try {
    const entry = rejectEntry(ctx.userId, entryId, parsedBody.data.reason, {
      userId: ctx.userId,
      actor: 'user',
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ id: entry.id, status: entry.status }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    if (message.includes('not pending')) {
      return NextResponse.json({ error: 'Entry is not pending' }, { status: 409 });
    }
    // biome-ignore lint/suspicious/noConsole: server-side error logging
    console.error('[api/logs/reject]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
