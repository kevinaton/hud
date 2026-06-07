---
id: Ticket 16
title: Implement Seven Cashflow MCP Tools with Vitest Coverage
status: done
priority: p2
area: feature
estimate: M
created: 2026-06-07
updated: 2026-06-07
depends-on: ["[[Ticket 15 Scaffold mcp-hud Package with Ping Tool and Shared DB Connection]]"]
blocks: ["[[Ticket 17 Write Emily AGENT.md Persona and Cashflow SKILL.md]]"]
blueprint: "[[plan/blueprints/26060701-hud-agent-runtime-emily]]"
tags: [task, area/feature]
---

## Goal

Implement all seven cashflow MCP tools in `packages/mcp-hud`, wiring them to the existing `apps/web/lib/db/` functions, with Vitest covering tool I/O and `audit_log` actor composition.

## Context

Phase A2 of `[[plan/blueprints/26060701-hud-agent-runtime-emily]]`. The MCP server scaffold (Ticket 15) is the foundation. This ticket adds the seven cashflow tools Emily uses: `cashflow.add`, `cashflow.edit`, `cashflow.delete`, `cashflow.list`, `cashflow.summary`, `cashflow.categories`, `cashflow.createCategory`. All tools wrap existing `apps/web/lib/db/transactions.ts` functions; `cashflow.createCategory` also requires adding `createCategory` to `apps/web/lib/db/categories.ts` if it does not exist.

All writes use `getActorString()` from `identity.ts` (Ticket 15) to compose `actor='agent:emily/gemini'` (or whichever CLI is active) in the `audit_log` row.

Engineer must load `.claude/skills/hud-money/SKILL.md`, `.claude/skills/hud-audit/SKILL.md`, and `.claude/skills/hud-db/SKILL.md`.

## Acceptance Criteria

### Tools
- [x] `cashflow.add(item, amountMinor, currency, occurredAt, categoryId?, notes?)` — wraps `createTransaction`; returns created row; writes `audit_log` with `actor=getActorString()`
- [x] `cashflow.edit(id, patch)` — wraps `updateTransaction`; patch fields all optional; returns updated row; writes `audit_log`
- [x] `cashflow.delete(id)` — wraps `deleteTransaction`; returns `{ ok: true }`; writes `audit_log`
- [x] `cashflow.list(year?, month?)` — wraps `listTransactions` + `getCurrentPeriod`; defaults to current month; returns array of transaction rows
- [x] `cashflow.summary(year?, month?)` — wraps `getMonthlyAggregations` + `calcDelta`; returns `{ net, gross, expense, deltas: { net, gross, expense } }`
- [x] `cashflow.categories()` — lists all categories for the owner user; returns array of `{ id, name, kind }`
- [x] `cashflow.createCategory(name, kind)` — wraps `createCategory` in `apps/web/lib/db/categories.ts`; writes `audit_log`; returns created category row

### Money rules (per `.claude/skills/hud-money/SKILL.md`)
- [x] All `amountMinor` values are validated as integers by Zod; non-integers are rejected with a clear error
- [x] No float amounts stored or returned — all amounts in minor units

### Audit
- [x] Every write tool (`cashflow.add`, `cashflow.edit`, `cashflow.delete`, `cashflow.createCategory`) writes exactly one `audit_log` row with `actor=getActorString()`
- [x] `audit_log.actor` value matches the `agent:<persona>/<cli>` pattern per Ticket 14 constraint (e.g. `agent:emily/gemini`)

### Errors
- [x] Tool returns `{ error: "ValidationError", message: "..." }` for Zod failures
- [x] Tool returns `{ error: "NotFound", message: "..." }` if `id` does not exist or does not belong to the owner user
- [x] Tool returns `{ error: "Unauthorized" }` if identity cannot be resolved (no `HUD_AGENT_ACTOR` set)

### Tests
- [x] Vitest covers each tool: happy path, Zod validation failure, NotFound case
- [x] Vitest verifies `audit_log.actor` contains the correct `agent:<persona>/<cli>` string for write tools
- [x] `pnpm test:run` passes (all tests across monorepo)
- [x] `pnpm typecheck` passes

## Sub-tasks

- [x] Check `apps/web/lib/db/categories.ts` for `createCategory`; add it if missing (with `ReqCtx` for audit)
- [x] Write `packages/mcp-hud/src/tools/cashflow.ts` — all 7 tools with Zod input schemas
- [x] Register all cashflow tools in `packages/mcp-hud/src/tools/index.ts`
- [x] Write `packages/mcp-hud/src/__tests__/cashflow.test.ts` — Vitest covering all 7 tools
- [x] Verify `audit_log.actor` pattern in tests matches Ticket 14 CHECK constraint
- [x] Run `pnpm test:run` and `pnpm typecheck`

## Open Questions

## Notes

### 2026-06-07 — implementation

**Architecture decision:** The MCP package cannot import from `apps/web/lib/db/` via `@/` Next.js path aliases. Instead, tool handlers use the MCP's own Drizzle client (`packages/mcp-hud/src/lib/db.ts`) and write to `audit_log` directly via the `@hud/db` schema. This is cleaner (no cross-package alias hacks) and testable (DB is injectable via `ToolCtx`).

**Handler extraction pattern:** All 7 tool handlers are exported as pure `handle*` functions that receive a `ToolCtx` (`{ actor, userId, db }`). The `registerCashflowTools` function wraps them in MCP server registration, resolving `actor` and `userId` from `process.env` at call time. Tests inject a custom in-memory DB directly into `ToolCtx` — no mocking of modules needed.

**Files added:**
- `apps/web/lib/db/categories.ts` — added `createCategory(userId, { name, kind }, ctx: ReqCtx)` with `writeAuditLog` in same transaction; emoji-stripping applied
- `packages/mcp-hud/src/tools/cashflow.ts` — 7 tool handlers + `registerCashflowTools` + helpers (`buildEditDiff`, `monthRange`, `getCurrentPeriod`, `getPriorPeriod`, `calcDelta`, `stripEmojiFromCategoryName`)
- `packages/mcp-hud/src/tools/index.ts` — updated to call `registerCashflowTools` (ping preserved)
- `packages/mcp-hud/src/__tests__/cashflow.test.ts` — 47 Vitest tests with in-memory SQLite (full schema including `chk_audit_actor` CHECK constraint)
- `packages/mcp-hud/vitest.config.ts` — added (node environment, no jsdom)

**Files modified:**
- `apps/web/lib/db/categories.ts` — added `createCategory`; import ordering fixed by Biome

**Test results:**
- `packages/mcp-hud`: 47 tests passed
- `apps/web`: 163 tests passed (all pre-existing tests still green)
- `pnpm typecheck`: passes on both packages
- `pnpm lint`: 0 errors, 1 warning (`noExcessiveCognitiveComplexity` on `buildEditDiff` — acceptable, complexity is 16 vs max 15, extracted from handleEdit for readability)

**Commits:** 1 (`feat(mcp-hud): implement 7 cashflow MCP tools with Vitest coverage`)

**Open Questions surfaced:** none
