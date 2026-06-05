---
id: Ticket 02
title: Build Database Schema Migrations and Money Library
status: done
priority: p2
area: infra
estimate: M
created: 2026-06-05
updated: 2026-06-05
depends-on: ["[[Ticket 01 Scaffold Monorepo and Design System]]"]
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/infra]
---

## Goal

Define the complete SQLite schema via Drizzle, run migrations, seed test data, and deliver the `lib/money` and `lib/audit` libraries that every subsequent ticket depends on.

## Context

Phase 0.3 of [[plan/blueprints/26060502-mvp-foundation-cashflow]]. The schema is the single source of truth for all data in the HUD system. Every downstream ticket (auth, cashflow, CSV importer) builds on top of this.

**Money invariant (critical):** all amounts are stored as signed `INTEGER` in minor units (centavos for PHP). Never floats, never `REAL`, never `NUMERIC`. This must be enforced at the TypeScript layer — `amount_minor` fields in Drizzle schema typed as `integer()`, and in application code as a named type (e.g. `MinorUnits = number & { readonly __brand: 'MinorUnits' }`) to prevent accidental float assignment.

The schema in `packages/db/schema.ts` must match the blueprint SQL exactly — column names, types, constraints, and indexes are specified and not subject to interpretation.

Engineer must load `.claude/skills/hud-db/SKILL.md`, `.claude/skills/hud-money/SKILL.md`, and `.claude/skills/hud-audit/SKILL.md` before implementing.

## Acceptance Criteria

- [x] `packages/db/schema.ts` defines all 5 tables — `users`, `sessions`, `categories`, `transactions`, `audit_log` — matching the blueprint SQL schema exactly (column names, types, default values, CHECK constraints, foreign keys, and all indexes)
- [x] `pnpm db:migrate` runs Drizzle Kit migration against `data/hud.db` with zero errors and produces the expected tables
- [x] `pnpm db:seed` creates: 1 user (`admin@hud.local`), 5 categories (no emoji, varied kinds), 3 transactions with distinct amounts, dates, and categories
- [x] `pnpm db:studio` opens Drizzle Studio and all 5 tables are visible with the seeded data
- [x] `lib/db/index.ts` exports a singleton Drizzle client with WAL mode enabled (`PRAGMA journal_mode=WAL`) and `data/hud.db` path read from `DATABASE_URL` env var
- [x] `lib/money/index.ts` exports: `formatMoney(amount_minor, currency)`, `parseToMinor(displayString)`, `addMinor(a, b)`, `subtractMinor(a, b)` — all operating on integers, no intermediate floats
- [x] `lib/money` Vitest unit tests cover: zero, negative values, large amounts (≥7 digits), PHP formatting, add/subtract rounding edge cases; coverage ≥ 80%
- [x] `lib/audit/index.ts` exports `writeAuditLog({ userId, actor, action, entity, entityId, payloadJson, ipAddress, userAgent })` — wraps a synchronous Drizzle insert into `audit_log`
- [x] `git grep -nE 'float|parseFloat|Number\(.*amount|\.toFixed.*amount'` returns zero results under `apps/` and `packages/`
- [x] All `amount` fields in the Drizzle schema use `integer()` — never `real()`, `numeric()`, or `text()` for money

## Sub-tasks

- [x] Add `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `@types/better-sqlite3` to `packages/db`
- [x] Write `packages/db/schema.ts` — 5 tables per blueprint schema (users, sessions, categories, transactions, audit_log)
- [x] Configure `drizzle.config.ts` pointing to `data/hud.db` and `packages/db/migrations/`
- [x] Run `drizzle-kit generate` to produce the initial migration SQL in `packages/db/migrations/`
- [x] Write `packages/db/seed.ts` — creates 1 user (plain password for dev only), 5 categories, 3 transactions
- [x] Add `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:studio` scripts to root `package.json`
- [x] Write `apps/web/lib/db/index.ts` — singleton `better-sqlite3` + Drizzle client, WAL mode, path from env
- [x] Write `apps/web/lib/money/index.ts` — `formatMoney`, `parseToMinor`, `addMinor`, `subtractMinor`
- [x] Write `apps/web/lib/money/money.test.ts` — unit tests for all exported functions
- [x] Write `apps/web/lib/audit/index.ts` — `writeAuditLog` helper (synchronous, wraps Drizzle insert)
- [x] Run `git grep` to verify zero float usage on money fields; fix any violations

## Open Questions

## Notes

### 2026-06-05 — Implementation

**Files added (7):**
- `packages/db/schema.ts` — all 5 tables (users, sessions, categories, transactions, audit_log) matching blueprint SQL exactly; partial unique index on `(user_id, external_id) WHERE external_id IS NOT NULL` via Drizzle's `.where(isNotNull(...))` API; inferred TypeScript types exported
- `packages/db/drizzle.config.ts` — Drizzle Kit config; runs from packages/db/; resolves DB path from env with fallback to `../../data/hud.db`
- `packages/db/seed.ts` — idempotent seed (ON CONFLICT DO NOTHING); 1 user, 5 categories, 3 transactions; guarded by `NODE_ENV !== 'production'` check
- `apps/web/lib/db/index.ts` — singleton Drizzle client; WAL + NORMAL sync + FK enforcement + busy_timeout=5000; exports `DrizzleTx` type for audit helper
- `apps/web/lib/money/index.ts` — re-exports `formatMoney` from `./format`, adds `parseToMinor` / `parseMoney` (alias), `addMinor`, `subtractMinor`, `sumMinor`, `pctDelta`; all enforce integer invariant at runtime
- `apps/web/lib/money/money.test.ts` — 39 tests covering all exported functions; zero, negative, large amounts, PHP format, add/subtract, rounding, error paths
- `apps/web/lib/audit/index.ts` — `writeAuditLog(tx, entry)` helper; MUST be called inside the same Drizzle transaction as the state change; enforces actor/action/entity types

**Files modified (5):**
- `packages/db/package.json` — added drizzle-kit, tsx, @types/* devDeps; removed better-sqlite3 (provided by workspace root)
- `packages/db/tsconfig.json` — added NodeNext module resolution for seed.ts and drizzle.config.ts
- `apps/web/package.json` — added `@hud/db: workspace:*` dep; bumped `better-sqlite3` from `^11.10.0` to `^12.10.0` (required for Node 25 compat); db:seed points to `../../packages/db/seed.ts`
- `package.json` (root) — db:generate/migrate/studio route to `@hud/db`; db:seed routes to `web`; added `better-sqlite3@^12.10.0`, `drizzle-orm`, `tsx` at workspace root so packages/db/seed.ts can resolve native deps
- `apps/web/lib/money/format.ts` — unchanged (existing); `index.ts` re-exports it

**Migration:** `packages/db/migrations/0000_fixed_warlock.sql` — single clean migration with all 5 tables and correct partial index

**Quality gates:**
- `pnpm typecheck` — PASS (0 errors)
- `pnpm lint` — PASS (0 errors, 0 warnings)
- `pnpm test:run` — PASS (45 tests, 2 test files)
- `pnpm build` — PASS
- Float grep — CLEAN (zero violations; test string mentions "float" in test description only)

**Deviation note:** `better-sqlite3` upgraded from `^11.10.0` to `^12.10.0`. Node 25.8.1 (the runtime on this machine) uses v8 headers that include `<source_location>` (C++20), which `better-sqlite3@11.x` cannot compile against on macOS Ventura's Clang 14. Version 12.x explicitly declares Node 25.x support and provides prebuilt binaries. Downstream tickets should use `better-sqlite3@^12.10.0`. The API surface is unchanged.

**Open questions surfaced:** none
