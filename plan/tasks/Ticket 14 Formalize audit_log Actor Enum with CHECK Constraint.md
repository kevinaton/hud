---
id: Ticket 14
title: Formalize audit_log Actor Enum with CHECK Constraint
status: done
priority: p2
area: feature
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: []
blocks: ["[[Ticket 15 Scaffold mcp-hud Package with Ping Tool and Shared DB Connection]]"]
blueprint: "[[plan/blueprints/26060701-hud-agent-runtime-emily]]"
tags: [task, area/feature]
---

## Goal

Add a Drizzle migration that applies a prefix-based CHECK constraint on `audit_log.actor` — formalising the `user`, `agent:<persona>/<cli>`, and `system` pattern so the schema enforces actor format from the moment Emily starts writing rows.

## Context

Phase A0 of `[[plan/blueprints/26060701-hud-agent-runtime-emily]]`. The `audit_log.actor` column exists (per Ticket 02/05) but its allowed values are informal strings. This ticket locks the format to a prefix-based CHECK constraint so all future agent writes (`agent:emily/gemini`, `agent:emily/claude`, etc.) conform at the DB layer. The constraint is prefix-based — adding a new persona or CLI is data-only, no future migration needed.

Engineer must load `.claude/skills/hud-db/SKILL.md` and `.claude/skills/hud-audit/SKILL.md`.

## Acceptance Criteria

- [x] A new Drizzle migration adds a CHECK constraint on `audit_log.actor`:
  `CHECK (actor = 'user' OR actor = 'system' OR actor LIKE 'agent:%/%')`
- [x] All existing rows in a fresh `pnpm db:migrate` run pass the constraint (no migration failure)
- [x] Attempting to insert a row with `actor = 'bad-value'` is rejected by SQLite (verified in a unit test or migration smoke test)
- [x] Attempting to insert `actor = 'agent:emily/gemini'` succeeds
- [x] Attempting to insert `actor = 'agent:emily/claude'` succeeds
- [x] Attempting to insert `actor = 'system'` succeeds
- [x] Attempting to insert `actor = 'user'` succeeds
- [x] `pnpm db:migrate` runs clean with zero errors
- [x] `pnpm typecheck` passes
- [x] `pnpm test:run` passes (existing audit tests must still pass)

## Sub-tasks

- [x] Write Drizzle migration adding CHECK constraint on `audit_log.actor`
- [x] Verify all existing seed/test data uses conforming actor values; fix any that don't
- [x] Add a unit test asserting the constraint rejects invalid actors and accepts all valid patterns
- [x] Run `pnpm db:migrate`, `pnpm typecheck`, `pnpm test:run`

## Open Questions

`'anon'` is actively used in existing routes (login, signup) but was not listed in the ticket's CHECK constraint spec (`user | system | agent:%/%`). The constraint was extended to include `'anon'` to match the hud-audit skill's documented actor table and the live codebase. The blueprint's Phase A0 description also omitted `'anon'` from its sample but the hud-audit skill is explicit. This is a clarification, not a design deviation.

## Notes

### 2026-06-07 — implementation

- Updated `packages/db/schema.ts`: imported `check` from `drizzle-orm/sqlite-core`; added `check('chk_audit_actor', ...)` to the `auditLog` table's third-parameter array alongside the existing index.
- Generated `packages/db/migrations/0002_glorious_lady_ursula.sql` via `pnpm db:generate`. Migration uses the standard SQLite table-recreation pattern (create `__new_audit_log`, copy data, drop original, rename). The CHECK constraint is:
  ```sql
  CONSTRAINT "chk_audit_actor" CHECK(actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'agent:%/%')
  ```
  `'anon'` added to cover pre-auth events already written by login/signup routes.
- `pnpm db:migrate` applied cleanly; existing rows (seed has no audit_log rows) all pass.
- Added `apps/web/lib/audit/__tests__/actor-constraint.test.ts` (14 tests): 8 acceptance cases (`user`, `anon`, `system`, `agent:emily/gemini`, `agent:emily/claude`, `agent:emily/opencode`, `agent:ops/gemini`, `agent:telegram-emily/gemini`) and 6 rejection cases (`bad-value`, `agent`, `agent:emily`, empty string, `random-string`, `agent-emily/gemini`).
- `pnpm typecheck` passes (both `web` and `@hud/db`).
- `pnpm test:run` passes — 163 tests across 14 test files, including 14 new constraint tests.
- Files: 1 modified (`schema.ts`), 4 added (`0002_glorious_lady_ursula.sql`, `0002_snapshot.json`, `_journal.json` updated, `actor-constraint.test.ts`)
- Commits: 1 (`feat(db): add CHECK constraint on audit_log.actor for actor enum enforcement`, sha `d3c6722`)
- Open Questions surfaced: `'anon'` inclusion — see Open Questions section above.
