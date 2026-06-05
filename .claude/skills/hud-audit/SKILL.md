---
name: hud-audit
description: HUD audit log invariant — every state-changing action in the application writes exactly one row to the `audit_log` table, in the same transaction as the change. Defines actor identity, action verbs, payload shape, and the helper function. Load this whenever a ticket adds/modifies a route that mutates DB state.
---

# HUD Audit Log Rules

**One rule, non-negotiable:**

> **Every successful state-changing action writes one `audit_log` row in the same DB transaction as the change. Failed actions that are security-relevant (login fail, lockout) also write a row.**

This is how we answer "who did what, when?" forensically — including "was that transaction typed by the operator or written by an agent?" (per server-layout blueprint `26060503`).

## Schema (defined in `packages/db/schema.ts`)

```sql
CREATE TABLE audit_log (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id),       -- nullable for pre-auth events
  actor           TEXT NOT NULL,                      -- see "Actor" below
  action          TEXT NOT NULL,                      -- see "Action verbs" below
  entity          TEXT NOT NULL,                      -- 'transaction' | 'category' | 'user' | 'session'
  entity_id       TEXT,                               -- string so we can log future UUIDs too
  payload_json    TEXT,                               -- JSON blob, see redaction rules
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_user_time ON audit_log(user_id, created_at DESC);
```

## Actor

Set from request context:

| Source | Actor value |
|---|---|
| Logged-in browser session | `user` |
| Anonymous (login attempt, signup) | `anon` |
| System job (cron, importer CLI run by operator) | `system` |
| Agent CLI invocation (server-side, `agent-hud` UID) | `agent:claude`, `agent:gemini`, `agent:opencode` (detected from `AUDIT_ACTOR` env var set by wrapper) |

The wrapper scripts in `/opt/agents/bin/` (per blueprint `26060503`) set `AUDIT_ACTOR=agent:claude` before invoking the agent. The app reads this env var when running CLI scripts. For HTTP requests, actor is always `user` or `anon`.

## Action verbs (closed set)

| Action | When |
|---|---|
| `signup` | New user created |
| `login` | Successful login |
| `login_fail` | Wrong password / wrong email |
| `lockout` | Account hit failed-attempts threshold |
| `logout` | Session destroyed |
| `session_expire` | Server-side session pruning |
| `create` | New row inserted (transaction, category) |
| `update` | Existing row mutated |
| `delete` | Row hard-deleted |
| `import` | Bulk insert via CSV importer |

Add new verbs by editing this skill file AND `packages/db/schema.ts` (CHECK constraint optional). Do not silently introduce new verbs.

## Payload (`payload_json`)

JSON object capturing the **minimum** to reconstruct the action. Rules:

- **Include:** the entity ID, the changed fields (key + new value), and any contextually important metadata (e.g. `category_id` for a transaction).
- **Exclude — always:** passwords, password hashes, session tokens, raw cookie values, age keys, Sentry DSN, full request bodies of auth routes.
- **For `update`:** include `before` and `after` only for the changed fields, not the whole row. Diff-only.
- **For `import`:** include `source_path`, `row_count`, `inserted`, `skipped`, `errors` — do not include row data.
- **For `login_fail`:** include the attempted email (helps detect targeted attacks). Do not include the attempted password. Do not log a password hash either.

Examples:

```json
// create transaction
{"entity_id": "12345", "item": "Grocery", "amount_minor": -34100, "currency": "PHP", "category_id": 4}

// update transaction
{"entity_id": "12345", "before": {"amount_minor": -34100}, "after": {"amount_minor": -34200}}

// login
{"email_hint": "k***@gmail.com"}

// login_fail
{"email_attempted": "kevin@example.com", "reason": "wrong_password"}

// lockout
{"locked_until": "2026-06-05T18:45:00Z", "failed_attempts": 5}
```

## The helper function

```ts
// apps/web/lib/audit/index.ts

export interface AuditEntry {
  userId: number | null;
  actor: 'user' | 'anon' | 'system' | `agent:${string}`;
  action: AuditAction;
  entity: 'transaction' | 'category' | 'user' | 'session';
  entityId?: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Writes one audit_log row. MUST be called from inside the same Drizzle transaction
 * as the underlying state change.
 */
export function writeAudit(tx: DrizzleTx, entry: AuditEntry): void;
```

## Required pattern (transactional)

```ts
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { transactions } from '@hud/db/schema';

export async function createTransaction(input: CreateTxInput, ctx: ReqCtx) {
  return db.transaction((tx) => {
    const [row] = tx.insert(transactions).values({
      userId: ctx.userId,
      item: input.item,
      amountMinor: input.amountMinor,
      // ...
    }).returning();

    writeAudit(tx, {
      userId: ctx.userId,
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
// ❌ Insert outside transaction (audit_log not atomic with change)
await db.insert(transactions).values(...);
await writeAudit(db, ...);                  // race: insert may succeed, audit may fail

// ❌ Skip audit for "obvious" actions
await db.update(transactions).set({ amountMinor: x }).where(...);
// no writeAudit                            // every state change requires audit

// ❌ Log sensitive fields
writeAudit(tx, { ..., payload: { password: input.password } });

// ❌ Log full request body
writeAudit(tx, { ..., payload: { body: req.body } });

// ❌ String-concat actor (use the closed set)
writeAudit(tx, { ..., actor: `user-${ctx.userId}` });
```

## CI / lint guard

```bash
# Every file under lib/db/* (except read-only query helpers) must reference writeAudit
for f in $(git ls-files 'apps/web/lib/db/*.ts' | grep -v -E '(query|read|select)\.ts$'); do
  grep -q 'writeAudit' "$f" || { echo "Missing audit in $f"; exit 1; }
done
```

## Verifying at task exit

When a ticket adds a state-changing endpoint, check off:

- [ ] Drizzle transaction wraps both the change and `writeAudit`
- [ ] `actor` set correctly from request context
- [ ] `payload_json` excludes secrets
- [ ] `update` payloads show diff only (before/after)
- [ ] A Vitest case asserts an `audit_log` row appears after the action

## When this skill applies

- Any new route under `app/api/*/route.ts` that does insert/update/delete
- Any new function under `apps/web/lib/db/*.ts` that mutates rows
- Any new CLI script under `scripts/` that writes to the DB
- Adding a new auth event

## When to escalate

- New action verb needed → propose to architect; update this skill file as part of the same PR.
- Soft-delete vs hard-delete policy questions → architect decides per entity.
- Need to log a value that *might* be sensitive (e.g. a user's display name) → ask architect before adding.
