---
id: Ticket 51
title: L0 Add Log and Airbnb Schema Migration and Extend Actor Tier
status: done
priority: p2
area: infra
estimate: S
created: 2026-06-12
updated: 2026-06-12
completed: 2026-06-12
depends-on: []
blocks: ["[[Ticket 52 L1 Build Gmail Read-Only Connector with Whitelist and DKIM Gate]]"]
blueprint: "[[plan/blueprints/26061201-logs-email-ingestion-airbnb]]"
tags: [task, area/infra]
---

## Goal

Write and apply Drizzle migrations for all `log_*`, `airbnb_*`, and `app_settings` tables; extend the `audit_log.actor` CHECK constraint to accept the `system:` prefix tier; and seed the default whitelist row and approval toggle.

## Context

The email ingestion pipeline (blueprint `26061201`) requires a new database layer before any connector or parser work can begin. This is the foundation ticket for all L0–L5 work.

Three schema layers are added:
1. **Generic ingestion layer:** `log_whitelist`, `log_entries`, `log_raw`, `log_rules`, `app_settings`
2. **Airbnb domain layer:** `airbnb_reservations`, `airbnb_payouts`, `airbnb_payout_items`
3. **Actor tier extension:** the current `audit_log.actor` CHECK must also accept `actor LIKE 'system:%'` (for `system:logs-ingest` and `system:logs-payout`)

Full table DDL is in the blueprint §3 Data Model. See `.claude/skills/hud-db/SKILL.md` for Drizzle migration conventions and `.claude/skills/hud-audit/SKILL.md` for audit_log schema rules.

## Acceptance Criteria

- [x] Drizzle migration file(s) created for `log_whitelist`, `log_entries`, `log_raw`, `log_rules`, `app_settings`
- [x] Drizzle migration created for `airbnb_reservations`, `airbnb_payouts`, `airbnb_payout_items`
- [x] All indexes defined in the blueprint §3 are present (`idx_log_user_status`, `idx_log_user_kind`, `idx_resv_user_status`, `idx_payitem_code`)
- [x] `audit_log.actor` CHECK constraint extended to allow `actor LIKE 'system:%'` (while retaining existing valid actors)
- [x] Migration applies cleanly on the production DB copy (`pnpm db:migrate`) with zero rows invalidated
- [x] After migration: `INSERT INTO audit_log (actor='system:logs-ingest')` is accepted; a bad actor value is rejected by the CHECK constraint
- [x] Seed: one `log_whitelist` row inserted for `(user_id=1, source='email', sender='automated@airbnb.com', enabled=1)`
- [x] Seed: one `app_settings` row inserted for `(user_id=1, key='logs.approval_required', value='true')`
- [x] All money columns in `airbnb_*` are `INTEGER` per `.claude/skills/hud-money/SKILL.md` (no REAL, no TEXT for amounts)
- [x] Drizzle schema types exported from `@hud/db` for all new tables

## Sub-tasks

- [x] Write Drizzle schema definitions for `log_whitelist`, `log_entries`, `log_raw`, `log_rules`, `app_settings`
- [x] Write Drizzle schema definitions for `airbnb_reservations`, `airbnb_payouts`, `airbnb_payout_items`
- [x] Generate and verify migration SQL (confirm all indexes, CHECK constraints, FK references)
- [x] Modify `audit_log` actor CHECK to add `OR actor LIKE 'system:%'`
- [x] Run `pnpm db:migrate` against production DB copy; confirm zero errors
- [x] Write seed inserts for whitelist row + approval_required setting
- [x] Export new Drizzle types from `@hud/db`

## Open Questions

## Notes

### 2026-06-12 — implementation
- Added 8 new tables to `packages/db/schema.ts`: log_whitelist, log_entries, log_raw, log_rules, app_settings, airbnb_reservations, airbnb_payouts, airbnb_payout_items
- Extended `audit_log.actor` CHECK to include `OR actor LIKE 'system:_%'`
- Extended `transactions.source` enum to include 'airbnb'
- Added `AuditAction` values 'approve' and 'reject'; new entity types for audit
- Migration 0004 (`packages/db/migrations/0004_small_landau.sql`) applied with SQLite recreate-table pattern for audit_log CHECK
- Seed: `seedLogsDefaults()` in `packages/db/seed.ts` + production rows inserted directly
- All airbnb_* money columns are INTEGER (centavos), no REAL
- Files: 2 modified (schema.ts, seed.ts), 2 created (migration SQL + snapshot)
- Commit: `067f6fa feat(db): add log_* and airbnb_* schema`
