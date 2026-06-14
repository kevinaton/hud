---
id: Ticket 60
title: Redesign Airbnb Page Layout with Tab Navigation and Redesigned Booking Cards
status: in-progress
priority: p2
area: feature
estimate: M
created: 2026-06-14
updated: 2026-06-14
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26061201-logs-email-ingestion-airbnb]]"
tags: [task, area/feature]
---

## Goal

Revamp the `/finance/airbnb` page layout to match the Figma design (node 346-113): stacked full-width summary card with period filter and % change badges, three-tab navigation (Bookings / Pay Outs / Cancelled), and redesigned cards for all three tabs.

## Context

The Airbnb balance sheet page was built in [[Ticket 56 L5a Build Airbnb Balance Sheet Tab]]. All data and DB queries are correct — this ticket is a **layout and UX redesign** only. No new DB columns or schema changes are required.

The Figma introduces three structural shifts:

1. **Summary card** — single full-width stacked card (not a 2-column grid). Amounts at display scale. A period filter button ("This month ▾") in the top-right, same options/behavior as the existing `CashflowFilterBar` (`this-month / 30d / 90d / custom`). Percentage change badge next to each label, calculated as current-period total vs previous equal-length period.
2. **Tab navigation** — `Bookings | Pay Outs | Cancelled` tab bar replaces the stacked vertical sections. Tab state is driven by URL search param `?tab=bookings` (default). RSC reads the param server-side to avoid client-only state.
3. **Card redesigns** — all three tabs have distinct card layouts per Figma screenshots.

**Figma reference:** https://www.figma.com/design/nqz84c1KzI5zMFjx7QHG6z/HUD?node-id=346-113

**Design extracted from all three Figma screenshots:**

### Summary card (same across all tabs)
```
[top-right]  This month ▾
┌──────────────────────────────────┐
│ P125,999,597                     │
│ Projected  +20% INC              │
├──────────────────────────────────┤
│ P192,938.45                      │
│ Realized   +5% inc               │
├──────────────────────────────────┤
│ 15 Confirmed  15 Paid Out  4 Cancelled │
│ [HazardStripe]                   │
└──────────────────────────────────┘
```

### Bookings tab
```
Bookings | Pay Outs | Cancelled        (tab bar, active underlined accent)
                              32 total  (right-aligned)

┌───────────────────────────────────┐
│ Stephanie Sabala    Paid Out      │  ← guest name (bold) + status (plain colored text)
│ ₱1,700.73                        │  ← amount (large, ~18–20px)
│ 2 nights | HMBDZMZMNM            │  ← nights + confirmation code (muted)
│ Jun 25, 2026 | 0800hrs           │  ← check-in date + time (muted) — omit time if not in DB
└───────────────────────────────────┘
```
Status text colors (no border, no pill):
- `Paid Out` → success (green)
- `Confirmed` → accent (cyan)
- `Cancelled` → muted

### Pay Outs tab
```
Bookings | Pay Outs | Cancelled

┌───────────────────────────────────┐
│ P49,999.67                        │  ← large payout total (full width, top)
├───────────────────────────────────┤
│ Kevin Aton, 4131 (PHP)  17 Items ▼│  ← bank label (muted) + collapsible item count trigger
├───────────────────────────────────┤  ← expanded items:
│ Stephanie Sabala      ₱1,700.73   │    guest name (bold left) | amount (green right)
│ HMBDZMZMNM                        │    confirmation code (muted)
│ Jun 25, 2026 | 0800hrs            │    date (muted)
└───────────────────────────────────┘
```
- Payout amount is the dominant element (top of card, large)
- Collapsible trigger is the bank label row (`Kevin Aton, 4131 (PHP)  N Items ▼`)
- Items expanded inline beneath the trigger
- `sentDate` and `expectedArrivalDate` are not visible in the Figma — omit or move to expanded detail

### Cancelled tab
```
Bookings | Pay Outs | Cancelled
                              32 total

┌───────────────────────────────────┐
│ Stephanie Sabala                  │  ← guest name only (bold)
│ HMBDZMZMNM                        │  ← confirmation code (muted)
└───────────────────────────────────┘
```
- No amount, no nights, no date, no status badge
- Minimal — name + code only

See `.claude/skills/hud-ui/SKILL.md` for design system constraints.
See `.claude/skills/hud-money/SKILL.md` for amount display rules.

## Acceptance Criteria

### Summary card
- [ ] Summary section is a single full-width stacked card: Projected row on top, Realized row below, each with a large display-size amount
- [ ] A period filter button ("This month ▾") renders top-right of the summary section, same options as `CashflowFilterBar`: `This month / 30 days / 90 days / Custom`
- [ ] Filter state is stored in URL search param `?filter=this-month` (default) — same pattern as cashflow
- [ ] All data on the page (totals, counts, lists) is scoped to the selected filter period
- [ ] A `+N% INC` / `+N% inc` percentage-change badge renders in green next to `Projected` and `Realized` labels; percentage = current-period total ÷ previous equal-length period total − 1 (show `+0%` if no prior-period data)
- [ ] Status counts (`Confirmed / Paid Out / Cancelled`) render as an inline row inside the summary card, scoped to the filter period
- [ ] HazardStripe retained at the bottom of the summary card

### Tab navigation
- [ ] A horizontal tab bar (`Bookings | Pay Outs | Cancelled`) renders below the summary card
- [ ] Active tab is underlined in accent color; inactive tabs are muted
- [ ] Tab state is driven by URL search param `?tab=bookings` (default); RSC reads the param server-side
- [ ] A `N total` count renders right-aligned below the tab bar, showing the count for the active tab's list

### Bookings tab
- [ ] Active reservations list renders under the Bookings tab
- [ ] Each booking card: row 1 = guest name (bold) + status plain colored text (no border/pill); row 2 = ₱ amount (large); row 3 = `N nights | CODE`; row 4 = formatted check-in date
- [ ] Check-in date formatted as `Mon DD, YYYY` in the UI (DB stores ISO `YYYY-MM-DD` — no change to DB); time suffix `| HHMMhrs` rendered only if a time component exists in the field, otherwise omitted
- [ ] Status colors: `Paid Out` = success, `Confirmed` = accent, `Cancelled` = muted — plain inline text, no border, no pill, no uppercase tracking

### Pay Outs tab
- [ ] Payouts list renders under the Pay Outs tab
- [ ] Each payout card: payout total (large, top, full width) → divider → bank label + `N Items ▼` (collapsible trigger on same row) → expanded items below
- [ ] Collapsible trigger is the bank label row, not a separate button
- [ ] Each expanded item: guest name (bold left) + amount (green right), confirmation code (muted), formatted date (muted)
- [ ] `sentDate` and `expectedArrivalDate` hidden from the main card view (retain in DB; can surface in a future detail view)
- [ ] "Posted to cashflow" badge retained if `cashflowTransactionId` is present (can be in expanded area)

### Cancelled tab
- [ ] Cancelled reservations list renders under the Cancelled tab
- [ ] Each cancelled card: guest name (bold) + confirmation code (muted) — no amount, no date, no status badge, no nights
- [ ] Cancelled items removed from the Bookings tab entirely

### Cleanup
- [ ] HazardStripes between sections removed (tabs replace them)
- [ ] `opacity-60` on cancelled rows removed (they are now in their own tab)
- [ ] No regression to existing data — all reservations, payouts, and payout items still queryable

## Sub-tasks

- [ ] Wire period filter to Airbnb page: add `?filter` search param support; pass resolved date range to all DB queries; reuse or adapt `CashflowFilterBar` component for the Airbnb route
- [ ] Add `getAirbnbPreviousPeriodTotals` query (or equivalent) to compute % change vs prior period
- [ ] Refactor summary section: single stacked full-width card, display-scale amounts, % change badges, inline counts, `This month ▾` button top-right
- [ ] Add `AirbnbTabBar` client component; read `?tab` from URL, default `bookings`; pass active tab to RSC via search param
- [ ] Restructure page: three conditional sections driven by active tab param
- [ ] Redesign `BookingRow`: guest name primary, amount large, nights|code row, formatted date row, plain colored status text
- [ ] Format check-in date utility: `YYYY-MM-DD` → `Mon DD, YYYY`; append `| HHMMhrs` only if time exists
- [ ] Redesign `PayoutRow`: payout total dominant, bank+count collapsible trigger, inline expanded items with guest/amount/code/date
- [ ] Build `CancelledRow`: name + code only, minimal
- [ ] Add `N total` count below tab bar per active tab
- [ ] Remove HazardStripes between sections; retain one after summary card
- [ ] Smoke-test: all three tabs, filter switching, % change badges, empty states

## Open Questions

_(All resolved — no open questions at ticket creation)_

- **"This month" filter:** Functional, not decorative. Reuse `CashflowFilterBar` pattern. URL search param `?filter=this-month`. % change = current period vs previous equal-length period.
- **Check-in time:** DB stores `YYYY-MM-DD` — no change to schema. UI formats as `Mon DD, YYYY`. Time suffix (`| 0800hrs`) shown only if DB field contains a time component; otherwise omitted. Do not hardcode `0800hrs`.
- **Tab state:** URL search param `?tab=bookings` (default). RSC-compatible, deep-link safe, back/forward works. Pattern already used in cashflow filter.
- **% change baseline:** Previous equal-length period (e.g. if filter = "this month June", baseline = May). Show `+0%` if no prior data exists.

## Notes

_Engineer appends progress notes here during implementation._
