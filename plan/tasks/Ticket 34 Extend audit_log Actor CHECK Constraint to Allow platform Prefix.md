---
id: Ticket 34
title: Extend audit_log Actor CHECK Constraint to Allow platform Prefix
status: done
priority: p2
area: infra
estimate: S
locus: local
created: 2026-06-09
updated: 2026-06-09
completed: 2026-06-09
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Update the `audit_log.actor` CHECK constraint to accept the new `platform:<name>` prefix tier so Hermes MCP calls can write audit rows without violating the constraint.

## Context

Phase B0 of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]. The existing CHECK constraint (from [[Ticket 14 Formalize audit_log Actor Enum with CHECK Constraint]]) accepts `user`, `system`, and `agent:<persona>/<cli>`. It does not yet accept `platform:<name>` (e.g. `platform:hermes-gateway`), which the `hud-mcp` daemon will write for every Hermes MCP call. This migration must land before the daemon can write audit rows without violating the constraint.

New four-arm constraint:
```
actor = 'user'
OR actor = 'system'
OR actor LIKE 'agent:%/%'
OR actor LIKE 'platform:%'
```

Per the blueprint §8, the `platform:<name>` tier is the new "External" tier — foreign platforms calling the MCP daemon (Hermes today, future platforms via the same pattern).

## Acceptance Criteria

- [x] Migration file added to `packages/db/migrations/` that drops and re-creates the `audit_log.actor` CHECK constraint with the four-arm form
- [x] Vitest cases: `platform:hermes-gateway` accepted; `platform:` (empty suffix) rejected; existing `user`, `system`, `agent:emily/claude` values still valid; an entirely unknown prefix rejected
- [x] Dry-run migration applied against a local copy of the DB produces zero invalid rows on existing data
- [x] `pnpm test` and `pnpm typecheck` pass

## Sub-tasks

- [x] Read `packages/db/migrations/` to locate the current `audit_log.actor` CHECK constraint definition
- [x] Write migration: drop + re-add CHECK with four-arm form
- [x] Add Vitest cases covering all four valid prefixes and at least two invalid values
- [x] Run migration locally; verify no existing row is invalidated
- [x] Run `pnpm test` and `pnpm typecheck`

## Open Questions

## Notes

### 2026-06-09 — implementation

- Added `packages/db/migrations/0003_extend_audit_actor_platform.sql` — drop+recreate `audit_log` with five-arm CHECK constraint (same pattern as migration 0002)
- Added `packages/db/migrations/meta/0003_snapshot.json` — Drizzle Kit snapshot for the new migration state
- Modified `packages/db/migrations/meta/_journal.json` — appended entry for migration 0003
- Modified `packages/db/schema.ts` — updated `check()` call to add `OR actor LIKE 'platform:_%'` arm; updated column comment
- Modified `apps/web/lib/audit/index.ts` — extended `AuditActor` union type with `` `platform:${string}` ``
- Modified `apps/web/lib/audit/__tests__/actor-constraint.test.ts` — updated `buildDb()` to use the new five-arm constraint; added 3 valid platform cases and 3 invalid platform cases

**Constraint deviation from blueprint §8:** The blueprint and ticket text specify `OR actor LIKE 'platform:%'`. Implementation uses `OR actor LIKE 'platform:_%'` (underscore before percent) to correctly enforce the AC that `platform:` with an empty suffix is rejected. SQLite `LIKE 'platform:%'` matches `'platform:'` (% matches zero chars), which would violate the AC. The `_` (single-char wildcard) ensures at least one character must follow the colon. This is a tightening of the spec that satisfies all stated AC; no schema redesign.

- Files: 2 added, 4 modified
- Commits: 1 (`feat(audit): extend actor CHECK constraint to allow platform:<name> prefix`)
- `pnpm typecheck` passes; all 21 actor-constraint Vitest cases pass; dry-run against local DB produces zero invalid rows
- Pre-existing lint errors in `packages/mcp-hud/src/http/` are unrelated to this ticket and untouched
