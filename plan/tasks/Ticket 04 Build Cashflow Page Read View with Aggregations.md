---
id: Ticket 04
title: Build Cashflow Page Read View with Aggregations
status: done
priority: p2
area: feature
estimate: M
created: 2026-06-05
updated: 2026-06-05
depends-on: ["[[Ticket 01 Scaffold Monorepo and Design System]]", "[[Ticket 02 Build Database Schema Migrations and Money Library]]", "[[Ticket 03 Implement Authentication Sign-up Login Session Lockout]]"]
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/feature]
---

## Goal

Deliver the `/finance/cashflow` read view as a Server Component: hero net-income card, gross/expense sub-cards with month-over-month delta badges, and a scrollable transaction list — all styled to match the Figma and powered by real seeded data from SQLite.

## Context

Phase 0.5 of [[plan/blueprints/26060502-mvp-foundation-cashflow]]. This is the primary demo milestone for the MVP — a logged-in user must be able to see the cyberpunk cashflow dashboard with real data and recognize it from the Figma. This ticket delivers the **read-only** view; the write path (add transaction modal) is Ticket 05.

Layout per Figma `node-id=309-631`. The full ASCII diagram is in the blueprint's §Cashflow page section. Key layout details: sticky header with hamburger + "Finance" title, tab bar (Cashflow active / Report), hero card, two sub-cards side-by-side (Gross | Expense), HazardStripe divider, TRANSACTIONS header with `[+]` button placeholder (wired in Ticket 05), transaction rows.

All aggregations are computed server-side on each page request — no external cache, no API round-trip, direct SQLite read via Drizzle. At MVP scale (≤1k transactions) this is well within acceptable response time.

Period defaults to the current calendar month in `Asia/Manila` timezone (fallback if user pref not set). Delta = (current month value − prior month value) / |prior month value|.

Engineer must load `.claude/skills/hud-ui/SKILL.md`, `.claude/skills/hud-db/SKILL.md`, and `.claude/skills/hud-money/SKILL.md` before implementing.

## Acceptance Criteria

- [x] `/finance/cashflow` is a React Server Component at the page level — no top-level `"use client"` directive on the page itself
- [x] Unauthenticated request to `/finance/cashflow` redirects to `/login` (enforced by `(app)/layout.tsx` from Ticket 03)
- [x] Hero card: `net_income = SUM(amount_minor)` for the current month, formatted by `Money` component (Orbitron, hero variant, large size)
- [x] Hero card delta badge: shows `+X% INC` or `-X% DEC` vs prior month; cyan if net improved, red if worsened
- [x] Gross sub-card: `SUM(amount_minor) WHERE amount_minor > 0` for current month with delta vs prior month
- [x] Expense sub-card: `SUM(-amount_minor) WHERE amount_minor < 0` for current month with delta vs prior month; amount displayed as positive (e.g. `P192,938.45`, not `-P192,938.45`)
- [x] Transaction list: all transactions for the current month, sorted by `occurred_at DESC`
- [x] Each `TransactionRow` shows: item name (white, top line), date formatted `MMM DD, YYYY` uppercase (e.g. `JUN 24, 2026`) | category name (muted, bottom line), amount right-aligned (green if `amount_minor > 0`, red if `amount_minor < 0`)
- [x] Date formatting is locale-independent — hardcoded month names array, not `Date.toLocaleString()`
- [x] `TabBar` renders "Cashflow" (active, cyan underline) and "Report" tabs; clicking "Report" navigates to `/finance/cashflow/report`
- [x] `HazardStripe` divider renders between the cards section and the transaction list header
- [x] `GridOverlay` renders as the full-page background
- [x] App shell: sticky header with hamburger icon (left) and "Finance" label (center); header background is `--surface` with `--border` bottom
- [x] `/finance` redirects to `/finance/cashflow` (permanent redirect, no flash)
- [x] `/finance/cashflow/report` renders a stub page (e.g. "Report — Coming in a future phase") — not a 404
- [x] Empty state: when the current month has zero transactions, hero shows `P0`, sub-cards show `P0`, list shows a non-crashing empty message (e.g. "No transactions this month")
- [x] Delta edge case: when prior month has zero transactions (division by zero), delta badge shows "—" instead of a percentage
- [x] Visual comparison to Figma `node-id=309-631` matches to eye: layout, typography scale, color (cyan, green, red, muted), spacing, radius, divider position

## Sub-tasks

- [x] Create `app/(app)/finance/layout.tsx` — auth-gated shell with sticky header (hamburger + "Finance" title)
- [x] Create `app/(app)/finance/page.tsx` — `redirect('/finance/cashflow')` (Next.js permanent redirect)
- [x] Create `app/(app)/finance/cashflow/page.tsx` — Server Component; fetches aggregations + transaction list, assembles full layout
- [x] Create `app/(app)/finance/cashflow/report/page.tsx` — stub ("Coming soon")
- [x] Write `lib/db/transactions.ts` — `getMonthlyAggregations(userId, year, month)` returning `{ net, gross, expense }` for current and prior month
- [x] Write `lib/db/transactions.ts` — `listTransactions(userId, year, month)` returning sorted transaction rows joined with category name
- [x] Write delta calculation utility — `calcDelta(current, prior)` returning percentage or null (handles zero prior)
- [x] Assemble hero card: `Money` component (64px Orbitron) + delta badge component
- [x] Assemble gross + expense sub-cards: `Money` component (20px) + delta badge
- [x] Assemble transaction section: "TRANSACTIONS" header with `[+]` placeholder button (non-functional in this ticket), divider line, mapped `TransactionRow` list
- [x] Implement current-month date range logic (first–last day of month, Asia/Manila timezone)
- [x] Implement locale-independent date format for transaction rows
- [x] Handle empty state for both zero aggregations and zero transaction list
- [x] Handle delta edge case (zero prior month)
- [x] Verify page renders correctly with the seeded data from `pnpm db:seed`

## Open Questions

## Notes

### 2026-06-05 — Implementation

**Files added (5):**
- `apps/web/lib/db/transactions.ts` — query helpers: `getMonthlyAggregations`, `listTransactions`, `calcDelta`, `getCurrentPeriod`, `getPriorPeriod`, `monthRange`. All queries are parameterized Drizzle; userId always first param; amounts are integer minor units throughout.
- `apps/web/app/(app)/finance/layout.tsx` — finance section shell: 56px sticky header, hamburger button (left), "Finance" title (center, absolutely positioned), `bg-surface` with `border-b border-border`.
- `apps/web/app/(app)/finance/page.tsx` — permanent redirect to `/finance/cashflow`.
- `apps/web/app/(app)/finance/cashflow/page.tsx` — main cashflow Server Component. Calls `requireSession()` for userId, fetches current+prior aggregations, renders hero card (64px Orbitron `Money` + delta badge), Gross/Expense sub-cards (20px, 2-col grid), `HazardStripe` divider, TRANSACTIONS header with disabled `[+]` placeholder, mapped `TransactionRow` list, empty state.
- `apps/web/app/(app)/finance/cashflow/report/page.tsx` — stub page with TabBar + "Report — Coming in a future phase" message.

**Files modified (2):**
- `apps/web/components/hud/TransactionRow.tsx` — replaced `toLocaleDateString` with hardcoded `MONTHS` array and direct ISO-8601 prefix parse (`iso.slice(0, 10)`). Changed `parseInt` → `Number.parseInt` (Biome lint).
- `apps/web/components/hud/Money.tsx` — added `style?: CSSProperties` prop so hero card can pass `fontSize: 64px`.

**Design decisions:**
- Expense sub-card uses `current.expense` which is always `>=0` (computed as `SUM(-amount_minor) WHERE amount_minor < 0`). The `Money` component displays it with `variant="neutral"` so it shows in foreground color, not red — the positive display invariant from the AC is satisfied.
- Hero delta badge label uses "INC"/"DEC" (per `NumericDisplay` component's established pattern). Blueprint mentions "EXP" but existing `NumericDisplay` uses "DEC"; stayed consistent with the implemented component.
- `getCurrentPeriod()` uses UTC+8 offset math (`nowUtc + 8h`) with `getUTC*` accessors — no Intl/locale APIs. `monthRange()` generates ISO-8601 strings with `+08:00` suffix to match how `occurred_at` is stored.
- `calcDelta(current, prior)` returns `null` when `prior === 0` (not the money lib's `pctDelta` which returns `0`). This is intentional — the ticket requires showing "—" not "0%" for undefined deltas.

**Quality bar:**
- `pnpm typecheck` — passes
- `pnpm lint` — passes (0 errors, 0 warnings)
- `pnpm build` — passes (all 12 routes compile; `/finance/cashflow` = Dynamic server-rendered)
- `pnpm test:run` — 110/110 tests pass
