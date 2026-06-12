---
id: Ticket 49
title: Patch and Import Legacy Cashflow CSV into HUD
status: done
priority: p1
area: feature
estimate: S
created: 2026-06-12
updated: 2026-06-12
completed: 2026-06-12
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/feature]
---

## Goal

Patch `db backups/cashflow_export.csv` to fix two data-quality issues, then import all 123 rows into the HUD transactions table for user `kevinyaton@gmail.com`.

## Context

Kevin's old cashflow app exported 123 transactions (Feb 4 – Jun 6 2026, all PHP / PHT) to `db backups/cashflow_export.csv`. The importer script already exists at `apps/web/scripts/import-cashflow.ts` (Ticket 06). Two issues were found during review:

1. **Seven rows have positive amounts but are actually expenses** (sign was flipped in the old app).
2. **One row uses category `Clothes` instead of `Clothing`** — needs to merge.

Kevin confirmed: negate all 7, rename `Clothes` → `Clothing`, then import.

The DB already has user ID 1 (`kevinyaton@gmail.com`) and 11 manually-entered transactions. The importer uses `onConflictDoNothing` on `(user_id, external_id)` so it is safe to re-run.

## Acceptance Criteria

- [x] `db backups/cashflow_export.csv` patched: the 7 positive-expense rows have negated amounts
- [x] `db backups/cashflow_export.csv` patched: every `Clothes` category value changed to `Clothing`
- [x] Dry-run completes with `Failed: 0`
- [x] Live import completes with `Failed: 0` and reports the inserted count
- [x] No new `Clothes` category exists in the DB after import (only `Clothing`)
- [x] The 7 formerly-positive rows are stored as negative `amount_minor` values in the DB

## Sub-tasks

- [x] Patch CSV — negate the 7 expense rows listed below
- [x] Patch CSV — rename `Clothes` → `Clothing` (1 row)
- [x] Run dry-run: `pnpm --filter web import:cashflow -- --file "db backups/cashflow_export.csv" --user-email kevinyaton@gmail.com --dry-run`
- [x] Confirm `Failed: 0` in dry-run output
- [x] Run live import (same command without `--dry-run`)
- [x] Confirm inserted count and `Failed: 0` in live output
- [x] Verify in DB: `SELECT COUNT(*) FROM transactions WHERE user_id = 1;`

## Rows to patch (negate amount)

| CSV `id` | Item | Old amount | New amount |
|---|---|---|---|
| 1777053142605 | Airbnb Parking | 600.0 | -600.0 |
| 1777174912988 | Airbnb Laundry | 250.0 | -250.0 |
| 1777267034323 | SHELL XAVIER ESTATE Payment | 1794.93 | -1794.93 |
| 1777429992959 | Hospital Checkup | 1000.0 | -1000.0 |
| 1777430369697 | Saint Francis Doctors Payment | 930.0 | -930.0 |
| 1777458306791 | Airbnb Expense | 280.0 | -280.0 |
| 1777527610728 | Airbnb Cleaning | 280.0 | -280.0 |

## Row to patch (category rename)

| CSV `id` | Item | Old category | New category |
|---|---|---|---|
| 1776584874501 | HLA AYALA MALLS C QR Payment | Clothes | Clothing |

## Open Questions

## Notes

### 2026-06-12 — implementation

- Patched `/srv/hud/app/db backups/cashflow_export.csv` using Python's `csv` module (safe quoting, no corruption):
  - Negated 7 positive-expense rows: Airbnb Parking (-600.0), Airbnb Laundry (-250.0), SHELL XAVIER ESTATE Payment (-1794.93), Hospital Checkup (-1000.0), Saint Francis Doctors Payment (-930.0), Airbnb Expense (-280.0), Airbnb Cleaning (-280.0)
  - Renamed category `Clothes` → `Clothing` for id=1776584874501 (HLA AYALA MALLS C QR Payment)
- Dry-run: Read 123, Parsed 123, Failed 0 — clean
- Live import: Inserted 123, Skipped 0, Failed 0 — 17 categories created (includes `Clothing`, no `Clothes`)
- DB verification:
  - `SELECT COUNT(*) FROM transactions WHERE user_id = 1` → **134** (11 manual + 123 imported)
  - All 7 formerly-positive rows confirmed negative in `amount_minor` (e.g. Airbnb Parking → -60000, SHELL XAVIER ESTATE → -179493)
  - `SELECT COUNT(*) FROM categories WHERE name = 'Clothes'` → **0**
  - `SELECT COUNT(*) FROM categories WHERE name = 'Clothing'` → **1**
- Files modified: `db backups/cashflow_export.csv` (patched in-place, no app code changed)
- Commits: none (data-only operation, CSV patched in working directory)
- Open Questions surfaced: none
