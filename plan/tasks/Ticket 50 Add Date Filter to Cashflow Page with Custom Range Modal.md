---
id: Ticket 50
title: Add Date Filter to Cashflow Page with Custom Range Modal
status: done
priority: p1
area: feature
estimate: M
created: 2026-06-12
updated: 2026-06-12
completed: 2026-06-12
completed: ~
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/feature]
---

## Goal

Add four date-range filter chips ("This month", "30 days", "90 days", "Custom") to the cashflow page so the summary cards (Net Income, Gross, Expense) and transaction list all reflect the selected period, with a custom-range modal for arbitrary start/end dates.

## Context

Kevin can only see June because the page is hardcoded to the current calendar month (`getCurrentPeriod()` + `getMonthlyAggregations()`). He wants to review historical data going back to February 2026 (now imported).

Figma reference: `node-id=328-336` (filter chips and custom date modal).

From the Figma and user description, the filter strip shows four pills:
- **This month** — current calendar month (existing default behaviour)
- **30 days** — rolling last 30 days from today
- **90 days** — rolling last 90 days from today
- **Custom** — arbitrary date range; clicking opens a modal with a calendar picker + manual date entry fields (start / end)

All three summary cards (Net Income / Gross / Expense) and the transaction list must reflect the active filter. The delta badge (INC/DEC %) compares to an equivalent prior window:
- "This month" → prior calendar month
- "30 days" → the 30 days before that window
- "90 days" → the 90 days before that window
- "Custom" → the same duration shifted back by the window length

**Architecture:** URL search params drive filter state — no client-side data fetching. The RSC reads `searchParams` and calls range-based DB helpers. Filter chips are a client component that does `router.replace` to navigate. Default (no param) = "This month".

URL shapes:
- `?filter=this-month` (or no param)
- `?filter=30d`
- `?filter=90d`
- `?filter=custom&from=2026-04-01&to=2026-06-12`

## Acceptance Criteria

- [x] Four filter chips render below the TRANSACTIONS header (or above the transaction list per Figma layout): "This month", "30 days", "90 days", "Custom"
- [x] Active chip is visually distinguished (filled/accent vs. outline)
- [x] Selecting "This month", "30 days", or "90 days" navigates to the correct URL param and re-renders with the correct data (no full page reload flicker beyond Next.js RSC revalidation)
- [x] All three summary cards (Net Income, Gross, Expense) reflect the selected date range
- [x] Transaction list reflects the selected date range
- [x] Delta badges (INC/DEC %) compare to the equivalent prior window for each filter mode
- [x] "Custom" chip opens a modal with start and end date inputs (calendar picker + manual `YYYY-MM-DD` text entry), an Apply button, and a Cancel button
- [x] Applying a custom range navigates to `?filter=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` and the page reflects the custom window
- [x] Invalid custom ranges (end before start, or either date missing) are blocked — Apply button disabled with an inline error
- [x] The period label below "Net Income" reflects the active filter (e.g. "June 2026", "Last 30 days", "Apr 1 – Jun 12, 2026")
- [x] Default state (no URL param) renders identically to the current page ("This month" active)
- [x] "30 days" chip is shown as active when `?filter=30d` is present — consistent across page load and navigation
- [x] No regressions on the add/edit/delete transaction modal flow
- [x] No client-side data fetching introduced — all aggregations and transaction lists remain server-side SQLite reads

## Sub-tasks

- [x] Add `getAggregationsByRange(userId, fromIso, toIso)` and `listTransactionsByRange(userId, fromIso, toIso)` to `lib/db/transactions.ts` (accept pre-computed ISO-8601 strings, reuse existing SQL aggregation logic)
- [x] Add `resolveFilterRange(searchParams)` utility that parses the URL filter param and returns `{ from, to, priorFrom, priorTo, label }` (all ISO strings + display label)
- [x] Refactor `cashflow/page.tsx` to accept `searchParams`, call `resolveFilterRange`, and use the new range-based DB helpers; the existing `getCurrentPeriod` / `getMonthlyAggregations` / `listTransactions` are now only called indirectly through the filter resolution
- [x] Build `CashflowFilterBar` client component — four pill buttons, reads current filter from URL via `useSearchParams`, navigates with `router.replace` on click; "Custom" click opens the date range modal
- [x] Build `CashflowDateRangeModal` client component — modal with two date fields (calendar + `<input type="date">`), Apply + Cancel, validates start ≤ end, navigates on apply; matches HUD modal style (no box-shadow, 2px radius, border-border)
- [x] Wire `CashflowFilterBar` and `CashflowDateRangeModal` into `CashflowTransactionSection` (or as sibling in the page layout, per Figma)
- [x] Update period label rendering in `cashflow/page.tsx` to use the filter-resolved label
- [x] Verify with data: switch to "90 days" and confirm Feb–Jun transactions appear; switch to "This month" and confirm only June appears

## UI Polish (Phase 2 — reopened 2026-06-12)

Functionality from Phase 1 is correct. The filter UI needs a redesign per Figma node-id=330-1632.

**Current (wrong):** four separate pill buttons below the TRANSACTIONS header row.

**Target (correct):** a single dropdown button in the TRANSACTIONS header row, to the left of [+]:

```
TRANSACTIONS                [This month ▾]  [+]
─────────────────────────────────────────────────
Clean                -₱280.00    JUN 24, 2026
...
```

- One button, accent-colored (`bg-accent text-accent-fg`), shows the active filter label
- Clicking opens a dropdown with all four options (This month / 30 days / 90 days / Custom)
- Active option is marked in the dropdown (accent text or checkmark)
- "Custom" still opens `CashflowDateRangeModal` — unchanged
- All URL param logic, `resolveFilterRange`, and DB helpers are untouched — UI only

### Additional Acceptance Criteria

- [x] The four separate pill buttons (`fieldset` layout) are removed from `CashflowFilterBar`
- [x] A single accent button showing the active filter label appears in the TRANSACTIONS header row, left of [+]
- [x] Clicking the button opens a dropdown panel below it with all four options
- [x] Active option is visually marked in the dropdown
- [x] "Custom" closes dropdown and opens `CashflowDateRangeModal`
- [x] Clicking outside the dropdown closes it without navigating
- [x] Dropdown panel: `border border-border`, `bg-background`, `rounded-sm`, no box-shadow
- [x] Button label updates correctly for custom ranges (e.g. "Apr 1 – Jun 12")
- [x] No regressions on add/edit/delete transaction modal

### Additional Sub-tasks

- [x] Rewrite `CashflowFilterBar.tsx` — single button + dropdown (shadcn DropdownMenu if available, otherwise controlled state + click-outside ref)
- [x] Update `CashflowTransactionSection.tsx` header `div` — inline filter button left of [+], remove standalone `<CashflowFilterBar />` below header
- [x] Verify label updates for all four modes including custom date range

## Open Questions

## Notes

### 2026-06-12 — implementation

**Files created (3):**
- `apps/web/lib/cashflow-filter.ts` — pure utility; `resolveFilterRange(searchParams)` → `FilterRange`; handles all four modes with Asia/Manila (+08:00) timezone arithmetic; exclusive-end `to` convention throughout; prior-window computation per mode
- `apps/web/components/hud/CashflowFilterBar.tsx` — four pill buttons; `useSearchParams` for hydration; `fieldset`/`legend` for accessibility; co-located `modalOpen` state that drives `CashflowDateRangeModal`
- `apps/web/components/hud/CashflowDateRangeModal.tsx` — shadcn Dialog; two `<input type="date">` fields; string-compare validation (YYYY-MM-DD lexicographic order); Apply disabled while invalid; `router.replace` on apply

**Files modified (3):**
- `apps/web/lib/db/transactions.ts` — added `getAggregationsByRange(userId, from, to)` and `listTransactionsByRange(userId, from, to)`; existing `getMonthlyAggregations`/`listTransactions` untouched
- `apps/web/components/hud/CashflowTransactionSection.tsx` — added `activeFilter` prop; imports and renders `CashflowFilterBar` between the TRANSACTIONS header and the list
- `apps/web/app/(app)/finance/cashflow/page.tsx` — accepts `searchParams: Promise<...>`; calls `resolveFilterRange(await searchParams)`; switched to range-based DB helpers; passes `activeFilter` to `CashflowTransactionSection`; removed MONTH_NAMES constant (label now from `resolveFilterRange`)

**Quality checks:**
- `pnpm typecheck` — clean
- `pnpm exec biome check` on all 6 files — clean (4 formatting/lint issues fixed)
- `pnpm build` — succeeded; `/finance/cashflow` correctly marked `ƒ` (dynamic)

**Commits:** 1 (`feat(cashflow): add date filter chips and custom range modal` — 271b995)

**Open Questions surfaced:** none

### 2026-06-12 — UI polish (Phase 2)

**Files modified (3):**
- `apps/web/components/hud/CashflowFilterBar.tsx` — full rewrite; removed `fieldset`/four-pill layout; new shape: single accent button (`bg-accent text-accent-fg`) showing active filter label + ▾ caret; clicking toggles a `div[role="menu"]` dropdown panel (`border-border bg-background rounded-sm z-20`, no box-shadow); four `button[role="menuitem"]` options (This month / 30 days / 90 days / Custom); active item marked with `text-accent font-[500]` + leading ✓; click-outside via `useRef` + `useEffect` `mousedown` listener; "Custom" opens `CashflowDateRangeModal`; added `activeFilterLabel` prop for server-resolved label (used for custom range display and as SSR fallback)
- `apps/web/components/hud/CashflowTransactionSection.tsx` — added `activeFilterLabel: string` prop; moved `<CashflowFilterBar>` from standalone position below header into the header's right-side `flex items-center gap-2` group, left of [+]; removed old standalone `<CashflowFilterBar />` + filter chips comment block
- `apps/web/app/(app)/finance/cashflow/page.tsx` — passed `periodLabel` (from `resolveFilterRange`) as `activeFilterLabel` prop to `CashflowTransactionSection`

**Quality checks:**
- `pnpm typecheck` — clean
- `pnpm exec biome check` on both hud components — clean (fixed ARIA role misuse on `ul`/`li`; used `div[role="menu"]` + `button[role="menuitem"]` pattern; fixed unused variable; fixed formatter)
- `pnpm --filter web build` — succeeded; `/finance/cashflow` remains `ƒ` (dynamic)

**Commits:** 1 (`feat(cashflow): replace filter pills with inline dropdown in TRANSACTIONS header` — ac6000c)

**Open Questions surfaced:** none

### 2026-06-12 — modal width + shared component polish

**Problem:** Both `CashflowDateRangeModal` (had `max-w-sm`) and `TransactionModal` (had `max-w-md`) were overriding the `DialogContent` base sizing (`w-[calc(100%-2rem)] max-w-lg`), making them unnecessarily narrow. Inputs were `w-full` but the container was the bottleneck.

**Fix:**
- Added `apps/web/components/hud/HudDialogContent.tsx` — shared wrapper around `DialogContent` that applies the HUD surface treatment (`bg-surface border-border rounded-[var(--radius)] shadow-none`) exactly once. No `max-w-*` override so the base `max-w-lg` (512px) applies uniformly.
- Updated `CashflowDateRangeModal.tsx` — replaced `<DialogContent className="...max-w-sm">` with `<HudDialogContent>`
- Updated `TransactionModal.tsx` — replaced `<DialogContent className="max-w-md ...">` with `<HudDialogContent>`

Both modals now use consistent `w-[calc(100%-2rem)] max-w-lg` sizing from `dialog.tsx`. Inputs fill the full container width as intended.

**Files:** 1 added (`HudDialogContent.tsx`), 2 modified (`CashflowDateRangeModal.tsx`, `TransactionModal.tsx`)

**Quality checks:**
- `pnpm typecheck` — clean
- `pnpm exec biome check` on all 3 files — clean (fixed `import type` on React)
- `pnpm --filter web build` — succeeded
