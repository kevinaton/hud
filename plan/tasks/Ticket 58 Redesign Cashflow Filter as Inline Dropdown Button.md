---
id: Ticket 58
title: Redesign Cashflow Filter as Inline Dropdown Button
status: todo
priority: p1
area: feature
estimate: S
created: 2026-06-12
updated: 2026-06-12
depends-on: ["[[Ticket 50 Add Date Filter to Cashflow Page with Custom Range Modal]]"]
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/feature]
---

## Goal

Replace the four separate filter pill buttons with a single dropdown button that sits inline with the [+] add button in the TRANSACTIONS header row, showing the active filter label in accent color and revealing a dropdown menu on click.

## Context

Ticket 50 shipped the filter functionality correctly (URL params, aggregations, transaction list all update). The UI needs a redesign per Figma node-id=330-1632.

Current layout (wrong):
```
TRANSACTIONS                              [+]
[This month] [30 days] [90 days] [Custom]
--- transaction list ---
```

Target layout (correct):
```
TRANSACTIONS        [This month ▾]  [+]
--- transaction list ---
```

One button. It shows the active filter label. It is accent-colored (`bg-accent text-accent-fg`). It sits in the existing TRANSACTIONS header row, to the left of the [+] button. Clicking the button opens a dropdown menu with all four options:
- This month
- 30 days
- 90 days
- Custom → still opens the `CashflowDateRangeModal`

The active option in the dropdown is visually marked (accent text or checkmark). Non-active options are standard muted text.

The `CashflowDateRangeModal` is unchanged — it still handles the custom date range. The URL param logic, `resolveFilterRange`, and DB helpers are all unchanged — this ticket is UI-only.

Figma reference: node-id=330-1632.

Per hud-ui skill: no box-shadow, 2px radius (rounded-sm), border-border for the dropdown panel, no inline hex.

## Acceptance Criteria

- [ ] The four separate pill buttons are removed from `CashflowFilterBar`
- [ ] A single button now appears in the TRANSACTIONS header row, horizontally aligned with the [+] add button — label on the left side of the row, [+] on the right
- [ ] The button displays the active filter label ("This month", "30 days", "90 days", or the custom date range label) in accent color (`bg-accent text-accent-fg`)
- [ ] Clicking the button opens a dropdown menu below it with all four options: "This month", "30 days", "90 days", "Custom"
- [ ] The currently active option is visually distinguished in the dropdown (accent text or a checkmark indicator)
- [ ] Selecting "This month", "30 days", or "90 days" closes the dropdown and navigates to the corresponding URL param (same behaviour as before)
- [ ] Selecting "Custom" closes the dropdown and opens `CashflowDateRangeModal` (unchanged)
- [ ] Clicking outside the dropdown closes it without navigating
- [ ] The dropdown panel matches HUD style: `border border-border`, `bg-background`, `rounded-sm`, no box-shadow
- [ ] `CashflowTransactionSection` header row contains TRANSACTIONS label on far left, filter dropdown + [+] button grouped on far right
- [ ] No regressions on the date range modal or the add/edit transaction modal

## Sub-tasks

- [ ] Rewrite `CashflowFilterBar.tsx` — remove `fieldset`/pill layout; implement a single button + dropdown (use a controlled `open` state + absolute-positioned panel, or a shadcn DropdownMenu if already in the project)
- [ ] Update `CashflowTransactionSection.tsx` — move the filter button into the header `div` alongside [+], to the left of the [+] button; remove the standalone `<CashflowFilterBar />` render below the header
- [ ] Verify the button label updates correctly when navigating between filters (including custom date ranges showing the formatted date label e.g. "Apr 1 – Jun 12")
- [ ] Check shadcn DropdownMenu is available; if not, implement with a `useRef` click-outside handler
- [ ] Confirm on mobile: dropdown opens below the button and doesn't overflow viewport

## Open Questions

## Notes
