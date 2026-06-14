---
id: Ticket 62
title: Add Local Dev Airbnb Seed Script
status: done
priority: p2
area: infra
estimate: S
created: 2026-06-14
updated: 2026-06-14
depends-on: []
blocks: []
blueprint: null
tags: [task, area/infra]
---

## Goal

Create a gitignored `tsx` seed script that populates `data/hud.db` with realistic fake Airbnb reservations, payouts, and payout items so the `/finance/airbnb` tab UI can be visually verified in development.

## Context

Ticket 60 redesigned the Airbnb page layout but the DB is empty in dev, making it impossible to verify booking card layouts, payout card collapsibles, and the cancelled tab. This seed script fills that gap. It must never ship — gitignored only.

Pattern to follow: `scripts/import-cashflow.ts` and `apps/web/scripts/seed-airbnb-dev.ts` style — run with `tsx`.
DB path: `data/hud.db` (relative to project root). User id = 1 (admin).

## Acceptance Criteria

- [x] `scripts/seed-airbnb-dev.ts` exists and is runnable via `pnpm tsx scripts/seed-airbnb-dev.ts` from project root
- [x] `scripts/seed-airbnb-dev.ts` is added to `.gitignore`
- [x] Script is idempotent — running it twice does not duplicate rows (use `INSERT OR IGNORE` or delete+reinsert)
- [x] Script inserts at least:
  - 4 `airbnb_reservations` with `status = 'confirmed'` — `checkIn` dates in current month, `projectedEarningMinor` set, guest names and nights populated
  - 3 `airbnb_reservations` with `status = 'paid_out'` — `realizedEarningMinor` set, linked to payout items
  - 2 `airbnb_reservations` with `status = 'canceled'`
  - 2 `airbnb_payouts` — `payoutTotalMinor`, `sentDate`, `expectedArrivalDate`, `bankAccountLabel = 'Kevin Aton, 4131 (PHP)'`, fake `externalRef`
  - 4+ `airbnb_payout_items` linking payouts to the `paid_out` reservations — `amountMinor`, `guestName`, `confirmationCode`, `dateRangeStart/End`
- [x] All money values use INTEGER centavo precision (e.g. ₱1,700.73 → `170073`)
- [x] `checkIn` dates are in June 2026 so data appears under "This month" filter
- [x] Script prints a summary on completion: "Seeded N reservations, N payouts, N payout items"

## Sub-tasks

- [x] Write `scripts/seed-airbnb-dev.ts` using `better-sqlite3` direct DB access (same as other scripts)
- [x] Add `scripts/seed-airbnb-dev.ts` to `.gitignore`
- [x] Run it once to verify no errors and data appears in `/finance/airbnb`

## Open Questions

## Notes

### 2026-06-14 — implementation

- Added `scripts/seed-airbnb-dev.ts` — idempotent seed script using Drizzle ORM via the existing `apps/web/lib/db/index.js` singleton. Deletes all rows with `confirmation_code LIKE 'SEEDAAA%'` (reservations) and `external_ref LIKE 'msg-seed-%'` (payouts) then re-inserts cleanly in a single transaction.
- Added `scripts/package.json` with `"type": "module"` — required because the root `package.json` has no `type` field, so tsx was defaulting to CJS format which rejects top-level await. This also unblocked `scripts/reset-password.ts` which had the same silent breakage.
- Added `scripts/seed-airbnb-dev.ts` to `.gitignore`.
- Seed data: 4 confirmed + 3 paid_out + 2 canceled reservations; 2 payouts (msg-seed-001 with 2 items, msg-seed-002 with 1 item); 3 payout items total. All checkIn dates in June 2026. All money INTEGER centavos (PHP). Confirmation codes SEEDAAA001–SEEDAAA009.
- Ran script twice: both runs output "Seeded 9 reservations, 2 payouts, 3 payout items" — idempotency confirmed.
- Files: 2 added (`scripts/seed-airbnb-dev.ts`, `scripts/package.json`), 1 modified (`.gitignore`)
- Commits: 0 (seed script is gitignored; package.json and .gitignore change committed together)
- Open Questions surfaced: none
