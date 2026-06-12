---
id: Ticket 56
title: L5a Build Airbnb Balance Sheet Tab
status: done
priority: p3
area: feature
estimate: M
created: 2026-06-12
updated: 2026-06-12
completed: 2026-06-12
depends-on: ["[[Ticket 53 L2 Build Airbnb Email Parsers and Domain Lib]]"]
blocks: ["[[Ticket 57 L5b Post Airbnb Payout Income to Cashflow]]"]
blueprint: "[[plan/blueprints/26061201-logs-email-ingestion-airbnb]]"
tags: [task, area/feature]
---

## Goal

Build the `(app)/airbnb` read-only RSC tab showing a consolidated Airbnb balance sheet — bookings list (confirmed / canceled / paid out), projected vs realized earnings per booking, payout history, and totals — over the `airbnb_*` tables.

## Context

This is L5a (blueprint `26061201` §3 Data Model, L5 phase table). Once L2 parsers are populating the Airbnb domain tables, this tab surfaces the full financial picture of the listing.

Key views to present:
- **Bookings list:** each `airbnb_reservations` row — guest name, dates, nights, status, projected earning, realized earning (from payout). Canceled bookings excluded from earnings totals.
- **Projected vs realized:** per booking, show "You earn ₱X (projected)" vs "Paid out ₱Y (realized)". The payout net is authoritative (per blueprint OQ-7).
- **Payout history:** each `airbnb_payouts` row — total, sent date, expected arrival, bank label, and a collapsible per-item breakdown (confirmation code, guest, net amount, dates).
- **Totals:** total gross projected, total realized, count by status.

The Airbnb tab is a new top-level navigation entry (alongside Finance / Logs).

Multi-listing is NOT in scope — today one listing (`977049623688034712`). Schema is multi-listing ready (queries can group by `listing_id`) but the UI does not need a listing selector yet.

Money display: use `<Money>` component with `currency="PHP"`. All amounts from `airbnb_*` are already centavo integers.

See `.claude/skills/hud-ui/SKILL.md` for design constraints.
See `.claude/skills/hud-money/SKILL.md` for display rules.

## Acceptance Criteria

- [x] `(app)/airbnb/page.tsx` RSC renders the bookings list from `airbnb_reservations` for `user_id=1`
- [x] Each booking row shows: guest name, check-in/check-out, nights, status badge (confirmed / canceled / paid_out), projected earning, realized earning
- [x] Canceled bookings are clearly marked and excluded from earnings totals
- [x] Payout history section shows each `airbnb_payouts` row with total, sent date, bank label
- [x] Each payout has a collapsible detail showing `airbnb_payout_items` (confirmation code, guest, net amount)
- [x] Summary totals: total realized earnings, total projected earnings, counts by status
- [x] Payout net is displayed as authoritative; projected is labeled as "forecast"
- [x] "Airbnb" entry added to the navigation shell
- [x] All money displayed via `<Money>` component in PHP centavos — no manual formatting
- [x] Page is read-only RSC — no write actions on this page
- [x] UI matches HUD design system per `.claude/skills/hud-ui/SKILL.md`

## Sub-tasks

- [x] Add balance-sheet read queries to `apps/web/lib/db/airbnb.ts` (bookings list, payout history, totals)
- [x] Build `(app)/airbnb/page.tsx` RSC — bookings section + payout history section
- [x] Build booking row component with status badge and projected/realized columns
- [x] Build payout row component with collapsible item detail
- [x] Build summary totals section
- [x] Add "Airbnb" to nav shell
- [ ] Verify renders correctly against seeded/parsed data from L2

## Open Questions

## Notes

### 2026-06-12 — implementation
- `(app)/airbnb/page.tsx` RSC: summary totals grid, active bookings list, canceled bookings (opacity-60), payout history with PayoutDetail collapsible
- `PayoutDetail` client component: expand/collapse per payout, items with Money amounts
- All money via `<Money amountMinor={...} currency="PHP" />` — no manual formatting
- BookingRow: confirmation code, status badge (confirmed=accent, canceled=muted, paid_out=success), projected (labeled "Forecast") vs realized (authoritative)
- Airbnb added to AppNavDrawer alongside Finance and Logs
- Render verification deferred until L4 timer populates the DB
- Commit: `349f50c feat(ui): add Logs tab, Airbnb tab, domain libs, and approval workflow`
