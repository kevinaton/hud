/**
 * Cashflow MCP tools.
 *
 * All 7 tools wrap the same business logic used by apps/web/lib/db/.
 * The MCP package uses its own DB connection (lib/db.ts) and writes
 * directly to the audit_log table in the same Drizzle transaction as
 * every state change.
 *
 * Per hud-money skill: amountMinor must be a signed INTEGER — validated
 * by Zod (z.number().int()) and enforced by runtime guard.
 *
 * Per hud-audit skill: every write tool writes exactly one audit_log
 * row inside the same db.transaction as the mutation.
 *
 * Per hud-db skill: userId is always resolved before any query.
 *
 * Identity: actor = getActorString() → "agent:<persona>/<cli>"
 * If HUD_AGENT_ACTOR is not set, tools that write return { error: "Unauthorized" }.
 */

import { auditLog, categories, transactions, users } from '@hud/db';
import type { AuditAction, Category, Transaction } from '@hud/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type DrizzleTx, db as defaultDb } from '../lib/db.js';

// ---------------------------------------------------------------------------
// DB injection type — allows tests to swap in an in-memory DB
// ---------------------------------------------------------------------------
export type CashflowDb = typeof defaultDb;

// ---------------------------------------------------------------------------
// MCP tool response helper
// ---------------------------------------------------------------------------

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
};

function ok(data: unknown): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

// ---------------------------------------------------------------------------
// Audit helper
//
// Writes one audit_log row. MUST be called inside the same Drizzle
// transaction as the underlying mutation.
// ---------------------------------------------------------------------------
function writeAudit(
  tx: DrizzleTx,
  entry: {
    userId: number;
    actor: string;
    action: AuditAction;
    entity: 'transaction' | 'category';
    entityId: string;
    payload?: Record<string, unknown>;
  },
): void {
  tx.insert(auditLog)
    .values({
      userId: entry.userId,
      actor: entry.actor,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      payloadJson: entry.payload ? JSON.stringify(entry.payload) : null,
      ipAddress: 'local',
      userAgent: 'mcp-hud/0.1.0',
    })
    .run();
}

// ---------------------------------------------------------------------------
// monthRange helper (mirrors apps/web/lib/db/transactions.ts)
// ---------------------------------------------------------------------------
function monthRange(year: number, month: number): { from: string; to: string } {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const fromStr = `${year}-${pad2(month)}-01T00:00:00+08:00`;
  let toYear = year;
  let toMonth = month + 1;
  if (toMonth > 12) {
    toMonth = 1;
    toYear = year + 1;
  }
  const toStr = `${toYear}-${pad2(toMonth)}-01T00:00:00+08:00`;
  return { from: fromStr, to: toStr };
}

// ---------------------------------------------------------------------------
// getCurrentPeriod helper (mirrors apps/web/lib/db/transactions.ts)
// ---------------------------------------------------------------------------
export function getCurrentPeriod(): { year: number; month: number } {
  const nowUtc = new Date();
  const offsetMs = 8 * 60 * 60 * 1000;
  const manilaTime = new Date(nowUtc.getTime() + offsetMs);
  return {
    year: manilaTime.getUTCFullYear(),
    month: manilaTime.getUTCMonth() + 1,
  };
}

// ---------------------------------------------------------------------------
// getPriorPeriod helper
// ---------------------------------------------------------------------------
export function getPriorPeriod(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

// ---------------------------------------------------------------------------
// calcDelta helper
// ---------------------------------------------------------------------------
export function calcDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return Math.round(((current - prior) / Math.abs(prior)) * 100);
}

// ---------------------------------------------------------------------------
// stripEmojiFromCategoryName (mirrors apps/web/lib/db/categories.ts)
// ---------------------------------------------------------------------------
export function stripEmojiFromCategoryName(name: string): string {
  return name
    .replace(/^[\p{Emoji}\s]+/u, '')
    .replace(/[\p{Emoji}\s]+$/u, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Zod schemas (exported for test use)
// ---------------------------------------------------------------------------

export const AddInputSchema = z.object({
  item: z.string().min(1),
  amountMinor: z.number().int(),
  currency: z.string().min(1).default('PHP'),
  occurredAt: z.string().min(1),
  categoryId: z.number().int().optional(),
  notes: z.string().optional(),
});

export const EditInputSchema = z.object({
  id: z.number().int(),
  patch: z.object({
    item: z.string().min(1).optional(),
    amountMinor: z.number().int().optional(),
    currency: z.string().min(1).optional(),
    occurredAt: z.string().min(1).optional(),
    categoryId: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
});

export const DeleteInputSchema = z.object({
  id: z.number().int(),
});

export const ListInputSchema = z.object({
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
});

export const SummaryInputSchema = z.object({
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
});

export const CreateCategoryInputSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['expense', 'income', 'transfer']),
});

// ---------------------------------------------------------------------------
// Context passed to each tool handler (injectable for testing)
// ---------------------------------------------------------------------------
export interface ToolCtx {
  /** Resolved actor string, or null if unauthorized */
  actor: string | null;
  /** Resolved userId, or null if not found */
  userId: number | null;
  /** Drizzle DB instance (injectable for testing) */
  db: CashflowDb;
}

// ---------------------------------------------------------------------------
// Core handler functions (pure — receive ToolCtx, no process.env access)
// These are exported for direct testing without MCP server overhead.
// ---------------------------------------------------------------------------

export async function handleAdd(rawInput: unknown, ctx: ToolCtx): Promise<ToolResponse> {
  const { actor, userId, db } = ctx;
  if (!actor) return ok({ error: 'Unauthorized' });
  if (userId === null) return ok({ error: 'Unauthorized' });

  const parsed = AddInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return ok({ error: 'ValidationError', message: parsed.error.message });
  }
  const input = parsed.data;

  if (!Number.isInteger(input.amountMinor)) {
    return ok({ error: 'ValidationError', message: 'amountMinor must be an integer' });
  }

  const row: Transaction = db.transaction((tx) => {
    const inserted = tx
      .insert(transactions)
      .values({
        userId,
        item: input.item,
        amountMinor: input.amountMinor,
        currency: input.currency,
        occurredAt: input.occurredAt,
        categoryId: input.categoryId ?? null,
        notes: input.notes ?? null,
        source: 'agent',
      })
      .returning()
      .get();

    if (!inserted) throw new Error('cashflow.add: insert returned no row');

    writeAudit(tx, {
      userId,
      actor,
      action: 'create',
      entity: 'transaction',
      entityId: String(inserted.id),
      payload: {
        item: inserted.item,
        amountMinor: inserted.amountMinor,
        currency: inserted.currency,
        categoryId: inserted.categoryId,
        occurredAt: inserted.occurredAt,
      },
    });

    return inserted;
  });

  return ok(row);
}

// ---------------------------------------------------------------------------
// buildEditDiff — pure helper for handleEdit
//
// Computes the Drizzle .set() payload and before/after diff from the
// existing row and incoming patch. Extracted to reduce cognitive complexity
// of handleEdit. Avoids bracket notation by using typed partial objects.
// ---------------------------------------------------------------------------

type EditPatch = z.infer<typeof EditInputSchema>['patch'];
type TransactionUpdatePayload = Partial<typeof transactions.$inferInsert> & {
  updatedAt: string;
};

/** Typed diff shape for audit payload — no index signature, so dot notation works. */
interface TxDiffFields {
  item?: string;
  amountMinor?: number;
  currency?: string;
  occurredAt?: string;
  categoryId?: number | null;
  notes?: string | null;
}

function buildEditDiff(
  existing: Transaction,
  patch: EditPatch,
): {
  before: TxDiffFields;
  after: TxDiffFields;
  updatePayload: TransactionUpdatePayload;
} {
  const before: TxDiffFields = {};
  const after: TxDiffFields = {};
  const updatePayload: TransactionUpdatePayload = { updatedAt: new Date().toISOString() };

  if (patch.item !== undefined && patch.item !== existing.item) {
    before.item = existing.item;
    after.item = patch.item;
    updatePayload.item = patch.item;
  }
  if (patch.amountMinor !== undefined && patch.amountMinor !== existing.amountMinor) {
    before.amountMinor = existing.amountMinor;
    after.amountMinor = patch.amountMinor;
    updatePayload.amountMinor = patch.amountMinor;
  }
  if (patch.currency !== undefined && patch.currency !== existing.currency) {
    before.currency = existing.currency;
    after.currency = patch.currency;
    updatePayload.currency = patch.currency;
  }
  if (patch.occurredAt !== undefined && patch.occurredAt !== existing.occurredAt) {
    before.occurredAt = existing.occurredAt;
    after.occurredAt = patch.occurredAt;
    updatePayload.occurredAt = patch.occurredAt;
  }
  if ('categoryId' in patch && patch.categoryId !== existing.categoryId) {
    before.categoryId = existing.categoryId;
    after.categoryId = patch.categoryId ?? null;
    updatePayload.categoryId = patch.categoryId ?? null;
  }
  if ('notes' in patch && patch.notes !== existing.notes) {
    before.notes = existing.notes;
    after.notes = patch.notes ?? null;
    updatePayload.notes = patch.notes ?? null;
  }

  return { before, after, updatePayload };
}

export async function handleEdit(rawInput: unknown, ctx: ToolCtx): Promise<ToolResponse> {
  const { actor, userId, db } = ctx;
  if (!actor) return ok({ error: 'Unauthorized' });
  if (userId === null) return ok({ error: 'Unauthorized' });

  const parsed = EditInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return ok({ error: 'ValidationError', message: parsed.error.message });
  }
  const { id, patch } = parsed.data;

  if (patch.amountMinor !== undefined && !Number.isInteger(patch.amountMinor)) {
    return ok({ error: 'ValidationError', message: 'amountMinor must be an integer' });
  }

  const existing = db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .get();

  if (!existing) {
    return ok({ error: 'NotFound', message: `Transaction ${id} not found` });
  }

  const row: Transaction = db.transaction((tx) => {
    const diff = buildEditDiff(existing, patch);

    const updated = tx
      .update(transactions)
      .set(diff.updatePayload)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning()
      .get();

    if (!updated) throw new Error('cashflow.edit: update returned no row');

    writeAudit(tx, {
      userId,
      actor,
      action: 'update',
      entity: 'transaction',
      entityId: String(id),
      payload: { entity_id: String(id), before: diff.before, after: diff.after },
    });

    return updated;
  });

  return ok(row);
}

export async function handleDelete(rawInput: unknown, ctx: ToolCtx): Promise<ToolResponse> {
  const { actor, userId, db } = ctx;
  if (!actor) return ok({ error: 'Unauthorized' });
  if (userId === null) return ok({ error: 'Unauthorized' });

  const parsed = DeleteInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return ok({ error: 'ValidationError', message: parsed.error.message });
  }
  const { id } = parsed.data;

  const existing = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .get();

  if (!existing) {
    return ok({ error: 'NotFound', message: `Transaction ${id} not found` });
  }

  db.transaction((tx) => {
    tx.delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .run();

    writeAudit(tx, {
      userId,
      actor,
      action: 'delete',
      entity: 'transaction',
      entityId: String(id),
    });
  });

  return ok({ ok: true });
}

export async function handleList(rawInput: unknown, ctx: ToolCtx): Promise<ToolResponse> {
  const { userId, db } = ctx;
  if (userId === null) return ok({ error: 'Unauthorized' });

  const parsed = ListInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return ok({ error: 'ValidationError', message: parsed.error.message });
  }

  const period =
    parsed.data.year !== undefined && parsed.data.month !== undefined
      ? { year: parsed.data.year, month: parsed.data.month }
      : getCurrentPeriod();

  const { from, to } = monthRange(period.year, period.month);

  const rows = db
    .select({
      id: transactions.id,
      userId: transactions.userId,
      item: transactions.item,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      occurredAt: transactions.occurredAt,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      notes: transactions.notes,
      source: transactions.source,
      externalId: transactions.externalId,
      createdAt: transactions.createdAt,
      updatedAt: transactions.updatedAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredAt, from),
        lt(transactions.occurredAt, to),
      ),
    )
    .orderBy(desc(transactions.occurredAt))
    .all();

  return ok(rows.map((r) => ({ ...r, categoryName: r.categoryName ?? null })));
}

export async function handleSummary(rawInput: unknown, ctx: ToolCtx): Promise<ToolResponse> {
  const { userId, db } = ctx;
  if (userId === null) return ok({ error: 'Unauthorized' });

  const parsed = SummaryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return ok({ error: 'ValidationError', message: parsed.error.message });
  }

  const period =
    parsed.data.year !== undefined && parsed.data.month !== undefined
      ? { year: parsed.data.year, month: parsed.data.month }
      : getCurrentPeriod();

  const prior = getPriorPeriod(period.year, period.month);

  const agg = (year: number, month: number) => {
    const { from, to } = monthRange(year, month);
    const row = db
      .select({
        net: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)`,
        gross: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountMinor} > 0 THEN ${transactions.amountMinor} ELSE 0 END), 0)`,
        expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountMinor} < 0 THEN -${transactions.amountMinor} ELSE 0 END), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.occurredAt, from),
          lt(transactions.occurredAt, to),
        ),
      )
      .get();
    if (!row) return { net: 0, gross: 0, expense: 0 };
    return {
      net: Math.trunc(Number(row.net)),
      gross: Math.trunc(Number(row.gross)),
      expense: Math.trunc(Number(row.expense)),
    };
  };

  const current = agg(period.year, period.month);
  const priorAgg = agg(prior.year, prior.month);

  return ok({
    net: current.net,
    gross: current.gross,
    expense: current.expense,
    deltas: {
      net: calcDelta(current.net, priorAgg.net),
      gross: calcDelta(current.gross, priorAgg.gross),
      expense: calcDelta(current.expense, priorAgg.expense),
    },
  });
}

export async function handleCategories(_rawInput: unknown, ctx: ToolCtx): Promise<ToolResponse> {
  const { userId, db } = ctx;
  if (userId === null) return ok({ error: 'Unauthorized' });

  const rows = db
    .select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(categories.name)
    .all();

  return ok(rows);
}

export async function handleCreateCategory(rawInput: unknown, ctx: ToolCtx): Promise<ToolResponse> {
  const { actor, userId, db } = ctx;
  if (!actor) return ok({ error: 'Unauthorized' });
  if (userId === null) return ok({ error: 'Unauthorized' });

  const parsed = CreateCategoryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return ok({ error: 'ValidationError', message: parsed.error.message });
  }
  const { name, kind } = parsed.data;

  const normalized = stripEmojiFromCategoryName(name);
  if (!normalized) {
    return ok({
      error: 'ValidationError',
      message: 'Category name is empty after emoji strip',
    });
  }

  // Check for duplicate
  const existing = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, normalized)))
    .get();

  if (existing) {
    return ok({
      error: 'ValidationError',
      message: `Category "${normalized}" already exists`,
    });
  }

  const row: Category = db.transaction((tx) => {
    const inserted = tx
      .insert(categories)
      .values({ userId, name: normalized, kind })
      .returning()
      .get();

    if (!inserted) throw new Error('cashflow.createCategory: insert returned no row');

    writeAudit(tx, {
      userId,
      actor,
      action: 'create',
      entity: 'category',
      entityId: String(inserted.id),
      payload: { name: inserted.name, kind: inserted.kind },
    });

    return inserted;
  });

  return ok(row);
}

// ---------------------------------------------------------------------------
// MCP server registration
//
// Wires the handler functions to actual MCP tools. Resolves actor and userId
// from process.env at call time (not module load time) so tests can override env.
// ---------------------------------------------------------------------------

function resolveCtxFromEnv(db: CashflowDb): ToolCtx {
  // biome-ignore lint/complexity/useLiteralKeys: env var lookup
  const actorEnv = process.env['HUD_AGENT_ACTOR'];
  // biome-ignore lint/complexity/useLiteralKeys: env var lookup
  const cliEnv = process.env['HUD_AGENT_CLI'];
  const actor = actorEnv && cliEnv ? `${actorEnv}/${cliEnv}` : actorEnv ? actorEnv : null;

  // biome-ignore lint/complexity/useLiteralKeys: env var lookup
  const ownerEnv = process.env['HUD_OWNER_USER_ID'];
  let userId: number | null = null;
  if (ownerEnv) {
    const parsed = Number.parseInt(ownerEnv, 10);
    if (!Number.isNaN(parsed)) userId = parsed;
  }
  if (userId === null) {
    const row = db.select({ id: users.id }).from(users).limit(1).get();
    userId = row?.id ?? null;
  }

  return { actor, userId, db };
}

export function registerCashflowTools(server: McpServer): void {
  server.tool(
    'cashflow.add',
    'Add a new cashflow transaction. amountMinor is a signed INTEGER in minor units (PHP centavos, USD cents). Negative = expense, positive = income.',
    {
      item: z.string().min(1),
      amountMinor: z.number().int(),
      currency: z.string().min(1).default('PHP'),
      occurredAt: z.string().min(1),
      categoryId: z.number().int().optional(),
      notes: z.string().optional(),
    },
    async (rawInput) => handleAdd(rawInput, resolveCtxFromEnv(defaultDb)),
  );

  server.tool(
    'cashflow.edit',
    'Edit an existing cashflow transaction. Provide the transaction id and a patch object with the fields to change. All patch fields are optional.',
    {
      id: z.number().int(),
      patch: z.object({
        item: z.string().min(1).optional(),
        amountMinor: z.number().int().optional(),
        currency: z.string().min(1).optional(),
        occurredAt: z.string().min(1).optional(),
        categoryId: z.number().int().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    },
    async (rawInput) => handleEdit(rawInput, resolveCtxFromEnv(defaultDb)),
  );

  server.tool(
    'cashflow.delete',
    'Delete a cashflow transaction by id. Returns { ok: true } on success.',
    {
      id: z.number().int(),
    },
    async (rawInput) => handleDelete(rawInput, resolveCtxFromEnv(defaultDb)),
  );

  server.tool(
    'cashflow.list',
    'List cashflow transactions for a given month. Defaults to the current month (Asia/Manila timezone). Returns an array of transaction rows joined with category name.',
    {
      year: z.number().int().optional(),
      month: z.number().int().min(1).max(12).optional(),
    },
    async (rawInput) => handleList(rawInput, resolveCtxFromEnv(defaultDb)),
  );

  server.tool(
    'cashflow.summary',
    'Get a summary of cashflow for a given month. Returns { net, gross, expense, deltas: { net, gross, expense } } all in minor units (integers). Defaults to the current month.',
    {
      year: z.number().int().optional(),
      month: z.number().int().min(1).max(12).optional(),
    },
    async (rawInput) => handleSummary(rawInput, resolveCtxFromEnv(defaultDb)),
  );

  server.tool(
    'cashflow.categories',
    'List all cashflow categories for the owner user. Returns an array of { id, name, kind }.',
    {},
    async (rawInput) => handleCategories(rawInput, resolveCtxFromEnv(defaultDb)),
  );

  server.tool(
    'cashflow.createCategory',
    "Create a new cashflow category. kind must be 'expense', 'income', or 'transfer'. Emoji are stripped from the name before storing. Returns the created category row.",
    {
      name: z.string().min(1),
      kind: z.enum(['expense', 'income', 'transfer']),
    },
    async (rawInput) => handleCreateCategory(rawInput, resolveCtxFromEnv(defaultDb)),
  );
}
