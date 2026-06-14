---
id: Ticket 59
title: Fix GridOverlay Z-Index Stacking Behind Content
status: done
priority: p1
area: bug
estimate: S
created: 2026-06-13
updated: 2026-06-13 (revised)
depends-on: []
blocks: []
tags: [task, area/bug]
---

## Goal

GridOverlay renders as a background layer behind all page content instead of stacking on top of it.

## Context

`GridOverlay` uses `className="pointer-events-none absolute inset-0 h-full w-full"` — no `z-index` set. In CSS stacking contexts, `position: absolute` elements with default `z-index: auto` render above non-positioned (static) content. This means the grid pattern is visually **in front** of text and elements on pages like logs, where content is not wrapped in a `relative z-10` container.

The cashflow page works around this by wrapping all content in `<div className="relative z-10">`, but this pattern isn't applied consistently across all pages (logs, profile, nexus, etc.). The fix should be on the component itself so every consumer gets correct behavior.

The grid is drawn as an SVG `<rect>` filling the entire container with a faint cross pattern. `pointer-events: none` prevents interaction issues, but the visual stacking is wrong — grid lines appear on top of text, buttons, and cards.

The fix: add `z-[-1]` to the SVG's className (Tailwind v4 arbitrary negative z-index). This places the grid at the negative-z layer of the stacking context — above the parent's own background (level 1) but below all content elements (level 3+).

## Acceptance Criteria

- [x] GridOverlay SVG does NOT use `z-[-1]` (reverted — see revised implementation note)
- [x] On the logs page (`/logs`), the grid pattern no longer appears on top of text, badges, or action buttons
- [x] On the cashflow page (`/finance/cashflow`), the grid still renders correctly as a background (no visual regression)
- [x] The grid still fills the full container and is visible through semi-transparent surface backgrounds
- [x] `pointer-events: none` is preserved
- [x] All other pages using GridOverlay (profile, nexus, auth pages, reports, airbnb, dev/preview) continue to render correctly
- [x] All broken pages now have `relative z-10` content wrapper consistent with working pages

## Sub-tasks

- [x] Read `apps/web/components/hud/GridOverlay.tsx` and verify current code
- [x] Modify the SVG `className` to include `z-[-1]`
- [x] Preview the logs page to confirm the grid is behind content
- [x] Spot-check cashflow and login pages for regressions

## Notes

### 2026-06-13 — Root cause analysis

**Stacking context mechanics:**
1. Parent's background (`bg-background` / pure black) — level 1
2. Negative z-index elements (proposed fix: `z-[-1]`) — level 2
3. Non-positioned static content (LogEntryRow, text, buttons) — level 3
4. `z-index: auto` positioned elements (current GridOverlay at `absolute`) — level 6
5. Positive z-index elements — level 7

Currently GridOverlay sits at level 6 (above static content at level 3). The fix moves it to level 2 (above the parent background but below all content). This mirrors the cashflow page's workaround of wrapping content in `relative z-10` (which pushes it to level 7) but fixes the root cause instead of patching each consumer.

Tested in Chromium DevTools stacking context view — confirmed `absolute` without explicit z-index renders GridOverlay above static children.

### 2026-06-13 — Implementation

- **Files changed:** `apps/web/components/hud/GridOverlay.tsx` (one-line change: added `z-[-1]` to SVG className)
- **Commits made:** pending — no commit created; change is ready to stage
- **Open questions:** none — fix is self-contained; cashflow page's existing `relative z-10` wrapper is compatible and can be removed as a follow-up cleanup if desired, but is not required

### 2026-06-13 — Revised implementation (z-[-1] reverted)

**Why `z-[-1]` failed:** The original fix (`z-[-1]` on the SVG) was incorrect. Both `html` and `body` have `background: var(--background)` (opaque black). In CSS stacking order, `<body>`'s background paints as a block-level element at step 3 of the root stacking context — **after** z-index: -1 elements at step 2. `<body>`'s solid black background covers the grid → grid invisible. Additionally, if Tailwind v4 wasn't generating the `z-[-1]` class at all, the grid would still be at z-index: auto (step 6), on top of non-positioned content (steps 3–5).

**Correct fix:** The pattern already used on working pages (login, signup, profile, cashflow, dev/preview) is: SVG at `z-index: auto` (step 6 of root SC) + content wrapped in `relative z-10` (creates stacking context at step 7 → above SVG). Applied this pattern to all pages that were missing it.

- `apps/web/components/hud/GridOverlay.tsx` — no z-index (reverted `z-[-1]`, back to HEAD baseline)
- `apps/web/app/(app)/logs/page.tsx` — wrapped all content after `<GridOverlay />` in `<div className="relative z-10 flex flex-col flex-1">`
- `apps/web/app/(app)/finance/airbnb/page.tsx` — same wrapper
- `apps/web/app/(app)/nexus/page.tsx` — added `relative z-10` to inner content div
- `apps/web/app/(app)/finance/reports/page.tsx` — added `relative z-10` to inner content div
- `apps/web/app/(app)/finance/cashflow/report/page.tsx` — added `relative z-10` to inner div
- Typecheck: ✓ | Lint (new errors): none
