/**
 * app/api/transactions/route.ts
 *
 * POST /api/transactions
 *
 * Creates a new transaction row, writes an audit log entry, and returns 201.
 *
 * Guards (in order):
 *   1. requireSession('response')  → 401 if not authenticated
 *   2. CSRF token verification     → 403 if missing or invalid
 *   3. Zod validation of body      → 400 with field errors if invalid
 *   4. createTransaction (DB)      → atomic insert + audit_log
 *   5. 201 with the new transaction
 *
 * Money invariant (hud-money skill):
 *   The client sends `amount` as a number (decimal, e.g. 280.00 or -280).
 *   This handler converts it: amountMinor = Math.round(amount * 100).
 *   No float ever reaches the DB.
 *
 * CSRF (hud-auth skill):
 *   Client sends token in the X-CSRF-Token header (set from the `hud_csrf` cookie).
 *   Server reads the `hud_csrf` cookie and compares via timingSafeEqual.
 */

import { getCsrfCookieValue } from '@/lib/auth/cookie';
import { extractCsrfFromRequest, verifyCsrfToken } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/index';
import { createTransaction } from '@/lib/db/transactions';
import { createTransactionSchema } from '@/lib/validators/transaction';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // 1. Session check
  // -------------------------------------------------------------------------
  const ctx = await requireSession('response');
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // 2. CSRF check
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // 3. Zod validation
  // -------------------------------------------------------------------------
  const parsed = createTransactionSchema.safeParse(body);
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

  // -------------------------------------------------------------------------
  // 4. Money conversion: decimal → signed integer minor units
  //    This is the single conversion point per hud-money skill.
  // -------------------------------------------------------------------------
  const amountMinor = Math.round(amount * 100);

  // Construct occurred_at as ISO-8601 with Asia/Manila offset (+08:00).
  // The date field is YYYY-MM-DD; we anchor it at start-of-day Manila time.
  const occurredAt = `${date}T00:00:00+08:00`;

  // -------------------------------------------------------------------------
  // 5. Create the transaction (atomic insert + audit in single db.transaction)
  // -------------------------------------------------------------------------
  const forwarded = request.headers.get('x-forwarded-for');
  const ipAddress = forwarded ? forwarded.split(',')[0].trim() : undefined;
  const userAgent = request.headers.get('user-agent') ?? undefined;

  try {
    const tx = createTransaction(
      {
        item,
        amountMinor,
        occurredAt,
        categoryName: categoryName ?? null,
        notes: notes ?? null,
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
        id: tx.id,
        item: tx.item,
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        occurredAt: tx.occurredAt,
        categoryId: tx.categoryId,
        notes: tx.notes,
        createdAt: tx.createdAt,
      },
      { status: 201 },
    );
  } catch (_err) {
    // Do not leak internal error details to the client.
    // In production, errors are captured by Sentry's global handler.
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
