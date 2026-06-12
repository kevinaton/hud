/**
 * app/api/logs/[id]/approve/route.ts
 *
 * POST /api/logs/:id/approve
 *
 * Approves a pending log_entry, projecting parsed data into airbnb_* tables.
 * For kind='airbnb.payout', also posts to cashflow (Ticket 57).
 *
 * Optional body: { autoApprove?: boolean } — if true, also inserts a
 * log_rules 'auto_approve' row for (sender, kind) so future matching
 * entries skip approval ("approve and don't ask again").
 *
 * Guards: session, CSRF, Zod, ownership enforced in lib/db/logs.ts.
 */

import { getCsrfCookieValue } from '@/lib/auth/cookie';
import { extractCsrfFromRequest, verifyCsrfToken } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/index';
import { approveEntry, upsertRule } from '@/lib/db/logs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const BodySchema = z.object({ autoApprove: z.boolean().optional() }).optional();

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

  // CSRF check
  let body: unknown;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
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
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ipAddress = forwarded ? forwarded.split(',')[0].trim() : undefined;
  const userAgent = request.headers.get('user-agent') ?? undefined;

  const reqCtx = {
    userId: ctx.userId,
    actor: 'user' as const,
    ipAddress,
    userAgent,
  };

  try {
    // Approve the entry (projects to airbnb_*, posts to cashflow if payout)
    const entry = approveEntry(ctx.userId, entryId, reqCtx);

    // "Approve and don't ask again" — insert auto_approve rule
    if (parsedBody.data?.autoApprove && entry.kind !== 'unknown') {
      upsertRule(
        ctx.userId,
        {
          sender: entry.sender,
          kind: entry.kind,
          action: 'auto_approve',
        },
        reqCtx,
      );
    }

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
    console.error('[api/logs/approve]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
