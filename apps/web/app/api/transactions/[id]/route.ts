/**
 * app/api/transactions/[id]/route.ts
 *
 * PUT  /api/transactions/[id]  — update a transaction
 * DELETE /api/transactions/[id] — delete a transaction
 *
 * Guards (in order for both methods):
 *   1. requireSession('response')  → 401 if not authenticated
 *   2. CSRF token verification     → 403 if missing or invalid
 *   3. Parse + validate transactionId → 400 if not a valid integer
 *   4. Ownership check via getTransactionById → 403 if not owned by user
 *   5. (PUT) Zod validation of body → 400 with field errors if invalid
 *   6. DB mutation + audit log write (atomic)
 *   7. 200 with updated row (PUT) or 204 (DELETE)
 *
 * Money invariant (hud-money skill):
 *   If `amount` is present, server converts: amountMinor = Math.round(amount * 100).
 *
 * CSRF (hud-auth skill):
 *   Client sends token in the X-CSRF-Token header.
 */

import { getCsrfCookieValue } from '@/lib/auth/cookie';
import { extractCsrfFromRequest, verifyCsrfToken } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/index';
import { deleteTransaction, getTransactionById, updateTransaction } from '@/lib/db/transactions';
import { updateTransactionSchema } from '@/lib/validators/transaction';
import { NextResponse } from 'next/server';

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function getIpAndUserAgent(request: Request): { ipAddress?: string; userAgent?: string } {
  const forwarded = request.headers.get('x-forwarded-for');
  const ipAddress = forwarded ? forwarded.split(',')[0].trim() : undefined;
  const userAgent = request.headers.get('user-agent') ?? undefined;
  return { ipAddress, userAgent };
}

// ---------------------------------------------------------------------------
// PUT /api/transactions/[id]
// ---------------------------------------------------------------------------
export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  // 1. Session check
  const ctx = await requireSession('response');
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Read body before CSRF check (body stream can only be read once)
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 3. CSRF check
  const csrfCookie = await getCsrfCookieValue();
  const csrfSubmitted = extractCsrfFromRequest(
    request.headers,
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : undefined,
  );
  if (!verifyCsrfToken(csrfCookie, csrfSubmitted)) {
    return NextResponse.json({ error: 'CSRF token invalid' }, { status: 403 });
  }

  // 4. Parse transaction id
  const { id: idStr } = await context.params;
  const transactionId = Number.parseInt(idStr, 10);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return NextResponse.json({ error: 'Invalid transaction id' }, { status: 400 });
  }

  // 5. Ownership check
  const existing = getTransactionById(ctx.userId, transactionId);
  if (!existing) {
    // Return 403 (not 404) to avoid information disclosure about whether the
    // transaction exists at all (privilege check, not existence check).
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 6. Zod validation
  const parsed = updateTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { item, amount, date, categoryName, notes } = parsed.data;

  // 7. Money conversion (only if amount was provided)
  const amountMinor = amount !== undefined ? Math.round(amount * 100) : undefined;

  // 8. occurred_at (only if date was provided)
  const occurredAt = date !== undefined ? `${date}T00:00:00+08:00` : undefined;

  const { ipAddress, userAgent } = getIpAndUserAgent(request);

  try {
    const updated = updateTransaction(
      ctx.userId,
      existing,
      {
        item,
        amountMinor,
        occurredAt,
        categoryName,
        notes,
      },
      {
        userId: ctx.userId,
        actor: 'user',
        ipAddress,
        userAgent,
      },
    );

    return NextResponse.json(
      {
        id: updated.id,
        item: updated.item,
        amountMinor: updated.amountMinor,
        currency: updated.currency,
        occurredAt: updated.occurredAt,
        categoryId: updated.categoryId,
        notes: updated.notes,
        updatedAt: updated.updatedAt,
      },
      { status: 200 },
    );
  } catch (_err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/transactions/[id]
// ---------------------------------------------------------------------------
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  // 1. Session check
  const ctx = await requireSession('response');
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. CSRF check (no body for DELETE — token comes only from header)
  const csrfCookie = await getCsrfCookieValue();
  const csrfSubmitted = extractCsrfFromRequest(request.headers, undefined);
  if (!verifyCsrfToken(csrfCookie, csrfSubmitted)) {
    return NextResponse.json({ error: 'CSRF token invalid' }, { status: 403 });
  }

  // 3. Parse transaction id
  const { id: idStr } = await context.params;
  const transactionId = Number.parseInt(idStr, 10);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return NextResponse.json({ error: 'Invalid transaction id' }, { status: 400 });
  }

  // 4. Ownership check
  const existing = getTransactionById(ctx.userId, transactionId);
  if (!existing) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ipAddress, userAgent } = getIpAndUserAgent(request);

  try {
    deleteTransaction(ctx.userId, transactionId, {
      userId: ctx.userId,
      actor: 'user',
      ipAddress,
      userAgent,
    });

    return new NextResponse(null, { status: 204 });
  } catch (_err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
