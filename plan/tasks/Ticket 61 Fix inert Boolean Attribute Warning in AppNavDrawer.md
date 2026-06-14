---
id: Ticket 61
title: Fix inert Boolean Attribute Warning in AppNavDrawer
status: done
priority: p2
area: bug
estimate: S
created: 2026-06-14
updated: 2026-06-14
depends-on: []
blocks: []
blueprint: null
tags: [task, area/bug]
---

## Goal

Fix the React 19 console error caused by passing an empty string for the `inert` boolean attribute in `AppNavDrawer.tsx`.

## Context

React 19 changed how boolean attributes work. The pattern `inert={'' as unknown as boolean}` was used in earlier React versions to set `inert` to true, but React 19 now treats an empty string as false and emits a console error:

> "Received an empty string for a boolean attribute `inert`. This will treat the attribute as if it were false. Either pass `false` to silence this warning, or pass `true` if you used an empty string in earlier versions of React to indicate this attribute is true."

Stack trace:
```
at div (AppNavDrawer.tsx:103)
at AppNavDrawer
at HudHeader
at AppLayout
```

The fix is a one-line change at line 109 of `apps/web/components/hud/AppNavDrawer.tsx`.

## Acceptance Criteria

- [x] `inert={!open ? ('' as unknown as boolean) : undefined}` replaced with `inert={!open || undefined}` (passes `true` when closed, `undefined` when open — which omits the attribute, correct behavior)
- [x] Console error no longer appears on any page that renders `AppNavDrawer`
- [x] Nav drawer still opens and closes correctly
- [x] No TypeScript errors introduced

## Sub-tasks

- [x] Edit line 109 of `apps/web/components/hud/AppNavDrawer.tsx`
- [x] Verify no other files use the same empty-string `inert` pattern

## Open Questions

## Notes

### 2026-06-14 — implementation
- Replaced `inert={!open ? ('' as unknown as boolean) : undefined}` with `inert={!open || undefined}` at line 109 of `apps/web/components/hud/AppNavDrawer.tsx`
- Grepped the full codebase (`apps/`, `packages/`) for `as unknown as boolean` — the only match in source was this one line (the other hits were `.next/` build artifacts)
- `pnpm typecheck` passes cleanly
- Pre-existing lint errors in unrelated files (`logs/page.tsx`, `mcp-hud/` package) were not introduced by this change and are outside the scope of this ticket
- Files: 1 modified (`apps/web/components/hud/AppNavDrawer.tsx`)
- Commits: 1 (`fix(nav): replace empty-string inert pattern with React 19 boolean idiom`)
- Open Questions surfaced: none
