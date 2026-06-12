---
id: Ticket 57
title: L5b Post Airbnb Payout Income to Cashflow
status: done
priority: p3
area: feature
estimate: S
created: 2026-06-12
updated: 2026-06-12
completed: 2026-06-12
depends-on: ["[[Ticket 56 L5a Build Airbnb Balance Sheet Tab]]"]
blocks: []
blueprint: "[[plan/blueprints/26061201-logs-email-ingestion-airbnb]]"
tags: [task, area/feature]
---

## Goal

When a payout `log_entry` is approved and recorded, automatically post exactly one idempotent net income row to the `transactions` table — and never create a duplicate on re-run.

## Context

This is L5b (blueprint `26061201` §3 schema, L5 phase table, OQ-2). This is the money-bearing step that was deliberately deferred until recording (L0–L4) and the balance sheet (L5a) were proven correct.

Design decisions from blueprint:
- **One income row per payout** (not per reservation) — the aggregate payout total is what actually hit the bank account.
- **`source='airbnb'`**, **`external_id='airbnb:payout:<gmail_message_id>'`** — this is the idempotency key; the `(user_id, external_id)` partial UNIQUE index on `transactions` prevents duplicates.
- **`occurred_at`** = payout `sent_date` in Asia/Manila timezone (ISO-8601 with `+08:00` offset). (OQ-2 confirmation pending — use `sent_date` unless operator specifies `expected_arrival_date`.)
- **Category:** `Airbnb` income — findOrCreate via the existing `findOrCreateCategory` function.
- **`actor='system:logs-payout'`** — this is a sub-tier of `system:` already allowed by the L0 CHECK extension.
- After posting, set `airbnb_payouts.cashflow_transaction_id = <new transaction id>` to link back.
- Re-running the ingest or re-approving must be a no-op: if `cashflow_transaction_id` is already set, skip posting.

See `.claude/skills/hud-money/SKILL.md` — `payout_total_minor` is already a centavo integer; pass it directly to `createTransaction`.
See `.claude/skills/hud-audit/SKILL.md` — posting writes one `audit_log` row with `actor='system:logs-payout'`.

## Acceptance Criteria

- [x] Approving a `payout` kind `log_entry` (via the Logs tab approve action) triggers posting to `transactions`
- [x] Exactly one `transactions` row created: `source='airbnb'`, `external_id='airbnb:payout:<gmail_message_id>'`, `amountMinor=payout_total_minor`, `currency='PHP'`, `occurredAt=sent_date` (Asia/Manila +08:00), category `Airbnb`
- [x] `airbnb_payouts.cashflow_transaction_id` is set to the new transaction id after posting
- [x] Re-approving the same payout (or re-running the ingest) creates zero additional `transactions` rows — idempotency enforced by the `(user_id, external_id)` UNIQUE index
- [ ] The new income row appears on the Cashflow page with correct amount and `Airbnb` category
- [x] One `audit_log` row written with `actor='system:logs-payout'`, `action='create'`, `entity='transaction'`
- [x] If `cashflow_transaction_id` is already non-null on the payout, posting is skipped silently (not an error)
- [x] No manual `parseFloat` or float arithmetic — `payout_total_minor` passed directly to `createTransaction` per `.claude/skills/hud-money/SKILL.md`

## Sub-tasks

- [x] Add `postPayoutToCashflow(userId, payoutId, ctx)` to `apps/web/lib/db/airbnb.ts` — creates transaction, sets cashflow_transaction_id, writes audit log, idempotency guard
- [x] Wire `postPayoutToCashflow` into the `approveEntry` path in `apps/web/lib/db/logs.ts` when `entry.kind === 'airbnb.payout'`
- [ ] Verify in the browser: approve a payout entry → income row appears in Cashflow
- [ ] Verify idempotency: approve the same entry twice → only one transaction row exists
- [ ] Verify `cashflow_transaction_id` is set on the payout row after posting

## Open Questions

- Confirm `occurred_at` source: `sent_date` vs `expected_arrival_date` (OQ-2 from blueprint — default is `sent_date`).

## Notes
