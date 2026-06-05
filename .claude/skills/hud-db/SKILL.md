---
name: hud-db
description: HUD database patterns — Drizzle ORM on SQLite (better-sqlite3) with WAL mode, migration discipline, query helpers, and the userId-first parameter convention. Load this whenever a ticket touches `packages/db/`, `apps/web/lib/db/`, schema, migrations, or seed data.
---

# HUD Database Patterns

## Engine

- **SQLite** via `better-sqlite3` (synchronous, single-file)
- **WAL mode** enabled at boot (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`)
- **Foreign keys enforced** (`PRAGMA foreign_keys = ON;`)
- **Single writer, many readers** — SQLite serializes writes; never spin up worker threads to "parallelize writes"
- **Replication** via Litestream → R2 in production (configured in `ops/litestream/`, not relevant to app code)

## ORM

- **Drizzle ORM** with `drizzle-orm/better-sqlite3` driver
- **Drizzle Kit** for migrations (`pnpm db:generate`, `pnpm db:migrate`)
- Schema lives in `packages/db/schema.ts` — **single source of truth** for both Drizzle types and SQL
- Migrations are generated SQL files, reviewed in PRs. Do not hand-edit generated migrations; if Drizzle generates wrong SQL, fix the schema and regenerate.

## File layout

```
packages/db/
├── schema.ts                # tables, indexes, types, enums
├── client.ts                # singleton better-sqlite3 + drizzle instance
├── migrations/              # generated; each `NNNN_<slug>.sql` + `meta/` folder
├── seed.ts                  # idempotent seed for local dev
└── drizzle.config.ts        # drizzle-kit config

apps/web/lib/db/
├── index.ts                 # re-exports `db` from @hud/db/client
├── transactions.ts          # query helpers for transactions
├── categories.ts            # query helpers for categories
├── users.ts                 # query helpers for users
├── sessions.ts              # query helpers for sessions
└── audit.ts                 # writeAudit (see hud-audit skill)
```

## Naming conventions

- **Table names:** plural snake_case (`users`, `transactions`, `audit_log`)
- **Column names:** snake_case in SQL → camelCase in TypeScript via Drizzle's column mapping
- **Foreign keys:** `<entity>_id` (`user_id`, `category_id`)
- **Timestamps:** `created_at`, `updated_at` — ISO-8601 text via `datetime('now')`
- **Money columns:** suffix `_minor` (e.g. `amount_minor`) — never `amount` alone (see `hud-money` skill)

## Index discipline

Every table has:

- A primary key (`INTEGER PRIMARY KEY` for autoincrement — implicit ROWID)
- An index on every foreign key
- An index on every column you `WHERE` or `ORDER BY` in a hot query
- Composite indexes lead with the most-selective column

Example (matches blueprint `26060502`):

```sql
CREATE INDEX idx_tx_user_date ON transactions(user_id, occurred_at DESC);
CREATE INDEX idx_tx_user_cat  ON transactions(user_id, category_id);
CREATE UNIQUE INDEX idx_tx_external ON transactions(user_id, external_id)
  WHERE external_id IS NOT NULL;
```

If you add a `WHERE` clause that doesn't hit an index, either add an index in the same PR or note it in the ticket as deferred (with a row-count threshold for when to add it).

## Query helper convention

Every function in `apps/web/lib/db/*` follows this signature:

```ts
export function listTransactions(
  userId: number,                  // ALWAYS first parameter
  opts: { from?: Date; to?: Date; limit?: number; offset?: number } = {}
): Transaction[];
```

**Rules:**

1. `userId` is **always the first parameter** for any function that touches per-user data. Forgetting it is a privilege bug. TypeScript enforces presence; reviewer enforces correctness.
2. **Never** export a function that builds a query without a `userId` filter unless the entity is explicitly cross-user (none exist at MVP).
3. **Never** accept "trust me" tokens like `ignoreUser: true`. If a system job needs cross-user access, name it explicitly (`adminListAllTransactions`) and call it only from `scripts/`.
4. Read helpers return Drizzle row types or plain TS interfaces — never `unknown`.
5. Write helpers return the created/updated row.
6. Write helpers run inside `db.transaction(...)` together with `writeAudit` (see `hud-audit` skill).
7. **No raw SQL with user input.** Drizzle parameterizes by default. `sql.raw()` is banned for any input-driven string.

## Required patterns

```ts
// ✅ Read helper
export function listTransactions(
  userId: number,
  opts: { from?: Date; to?: Date; limit?: number; offset?: number } = {}
): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        opts.from ? gte(transactions.occurredAt, opts.from.toISOString()) : undefined,
        opts.to   ? lt(transactions.occurredAt,  opts.to.toISOString())   : undefined,
      ),
    )
    .orderBy(desc(transactions.occurredAt))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0)
    .all();
}

// ✅ Write helper inside a transaction with audit
export function createTransaction(
  userId: number,
  input: CreateTxInput,
  ctx: ReqCtx,
): Transaction {
  return db.transaction((tx) => {
    const [row] = tx.insert(transactions).values({
      userId,
      item: input.item,
      amountMinor: input.amountMinor,
      currency: input.currency,
      occurredAt: input.occurredAt,
      categoryId: input.categoryId ?? null,
      notes: input.notes ?? null,
      source: 'manual',
    }).returning();

    writeAudit(tx, {
      userId,
      actor: ctx.actor,
      action: 'create',
      entity: 'transaction',
      entityId: String(row.id),
      payload: {
        item: row.item,
        amountMinor: row.amountMinor,
        currency: row.currency,
        categoryId: row.categoryId,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  });
}
```

## Forbidden patterns

```ts
// ❌ Missing userId filter
db.select().from(transactions).all();

// ❌ Raw SQL with user input
db.run(sql.raw(`SELECT * FROM transactions WHERE item = '${input}'`));

// ❌ Write without audit
db.insert(transactions).values(...).run();

// ❌ Write outside transaction when audit is involved
db.insert(transactions).values(...).run();
db.insert(audit_log).values(...).run();   // not atomic

// ❌ Async + better-sqlite3
const rows = await db.select()...;        // better-sqlite3 is synchronous; no await
```

## Migrations

- Generated by `pnpm db:generate` after editing `schema.ts`
- Reviewed in PR — the SQL is human-readable; check it
- Filename pattern: `NNNN_<descriptive>.sql` (Drizzle's default)
- **Never** edit an applied migration. To fix, write a new migration that corrects forward.
- Destructive changes (drop column, rename table) require a backfill plan in the ticket Notes and architect sign-off.

## Seed (`packages/db/seed.ts`)

- Idempotent: re-running must produce the same final state, not duplicates
- Uses `INSERT OR IGNORE` or upsert via `ON CONFLICT DO NOTHING`
- Creates: one dev user (`dev@local`, password `password` — local only, env-gated by `NODE_ENV !== 'production'`), 5 categories, ~20 sample transactions covering positive + negative across multiple months for delta visualization
- Reads fixture data from `packages/db/fixtures/*.json` — not hard-coded literals scattered through the seed

## Connection setup

```ts
// packages/db/client.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database(process.env.DATABASE_URL?.replace(/^file:/, '') ?? './data/hud.db');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

## When this skill applies

- Any change to `packages/db/`
- Any new query helper in `apps/web/lib/db/`
- Any new route handler that calls a query helper
- Any new migration

## When to escalate

- Schema change that breaks an existing migration's invariant — architect approves the rollback path
- Need a new index that would cost > 10% storage on a large table — architect reviews the trade-off
- Considering Postgres or any non-SQLite engine — full architect review, not a database PR
