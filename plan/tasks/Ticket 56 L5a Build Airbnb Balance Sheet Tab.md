---
id: Ticket 56
title: L5a Build Airbnb Balance Sheet Tab
status: todo
priority: p3
area: feature
estimate: M
created: 2026-06-12
updated: 2026-06-12
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

- [ ] `(app)/airbnb/page.tsx` RSC renders the bookings list from `airbnb_reservations` for `user_id=1`
- [ ] Each booking row shows: guest name, check-in/check-out, nights, status badge (confirmed / canceled / paid_out), projected earning, realized earning
- [ ] Canceled bookings are clearly marked and excluded from earnings totals
- [ ] Payout history section shows each `airbnb_payouts` row with total, sent date, bank label
- [ ] Each payout has a collapsible detail showing `airbnb_payout_items` (confirmation code, guest, net amount)
- [ ] Summary totals: total realized earnings, total projected earnings, counts by status
- [ ] Payout net is displayed as authoritative; projected is labeled as "forecast"
- [ ] "Airbnb" entry added to the navigation shell
- [ ] All money displayed via `<Money>` component in PHP centavos — no manual formatting
- [ ] Page is read-only RSC — no write actions on this page
- [ ] UI matches HUD design system per `.claude/skills/hud-ui/SKILL.md`

## Sub-tasks

- [ ] Add balance-sheet read queries to `apps/web/lib/db/airbnb.ts` (bookings list, payout history, totals)
- [ ] Build `(app)/airbnb/page.tsx` RSC — bookings section + payout history section
- [ ] Build booking row component with status badge and projected/realized columns
- [ ] Build payout row component with collapsible item detail
- [ ] Build summary totals section
- [ ] Add "Airbnb" to nav shell
- [ ] Verify renders correctly against seeded/parsed data from L2

## Open Questions

## Notes
