---
id: Ticket 59
title: Enhance Sign-In Page with Live Clock Attempts Footer and Animated Bar Component
status: done
priority: p2
area: feature
estimate: M
created: 2026-06-14
updated: 2026-06-15
depends-on: []
blocks: []
blueprint: null
tags: [task, area/feature]
---

## Goal

Enhance the sign-in page with three visual upgrades: move the "N attempts remaining" counter below the submit button, add a live timezone + centisecond clock display, and ship an animated accent bar at the bottom of the page as a reusable component.

## Context

The sign-in page already shows an attempts-remaining counter (shipped in [[Ticket 31 Change Lockout to 3 Attempts and Always Show Remaining-Attempts Counter]]) but the Figma (node 346-47) repositions it below the form. Two new elements are also specified: a live clock with timezone label and centisecond/millisecond precision, and an animated accent bar fixed to the bottom of the viewport. The bar must be a reusable component.

**Figma reference:** https://www.figma.com/design/nqz84c1KzI5zMFjx7QHG6z/HUD?node-id=346-47

**Design text extracted from Figma frame:**
```
HUD
Authorized personnel only
[USER]  Enter your email address
[KEY]   [ACCESS]
02 Attempts Remaining
17:23:45:45
PH Manila
```

**Clock format:** `HH:MM:SS:cs` — four colon-separated segments where the last two digits are centiseconds (1/100s). Timezone label is separate: `PH Manila` (resolved from the server/browser locale at render time, not hardcoded).

No blueprint exists for this UI work — contained visual enhancement, no schema changes.

## Acceptance Criteria

- [x] The "N attempts remaining" counter renders *below* the `ACCESS` button (bottom of the sign-in card), zero-padded to two digits (e.g. `02 Attempts Remaining`)
- [x] A live clock ticking in `HH:MM:SS:cs` format (centiseconds, not milliseconds — matching Figma `17:23:45:45`) renders on the sign-in page and updates every 10ms or faster
- [x] The timezone label (e.g. `PH Manila`) renders adjacent to or below the clock, derived from the browser's `Intl` API — not hardcoded
- [x] An animated accent bar is fixed to the very bottom of the sign-in page viewport and is implemented as a reusable React component (`<AnimatedBar />`) exported from `apps/web/components/ui/animated-bar.tsx`
- [x] `<AnimatedBar />` accepts at minimum a `className` prop and a `variant` or `color` prop for per-page theming
- [x] No regression to existing lockout behavior — 3-attempt lockout still fires, counter decrements correctly

## Sub-tasks

- [x] Locate the sign-in page component (`apps/web/...`) and identify where the attempts-remaining UI currently renders
- [x] Move attempts-remaining counter below the submit/ACCESS button; zero-pad to 2 digits
- [x] Build `LiveClock` component — `setInterval` at 10ms or `requestAnimationFrame`; format `HH:MM:SS:cs`; include timezone label from `Intl.DateTimeFormat().resolvedOptions().timeZone` + city name
- [x] Place `LiveClock` on the sign-in page, below the attempts counter (matching Figma layout)
- [x] Build `AnimatedBar` component at `apps/web/components/ui/animated-bar.tsx` with a CSS keyframe animation (sliding gradient or pulse — check Figma for exact motion)
- [x] Fix `AnimatedBar` to `position: fixed; bottom: 0` on the sign-in page
- [x] Export `AnimatedBar` cleanly; confirm it can be dropped into other pages without sign-in-specific coupling
- [x] Smoke-test: clock ticks centiseconds, bar animates, attempts counter at bottom, lockout still works

## Open Questions

- **Bar animation style:** Figma node 346-47 shows a bar but motion spec may not be in the static frame — engineer should open Figma in Dev Mode to check if there's a prototype or annotation. If nothing, default to a slow left-to-right gradient sweep.
- **`LiveClock` reuse:** Should this component also appear on the dashboard or other pages? If yes, move it to a shared location (`packages/ui` or `apps/web/components/ui/`).
- **Centiseconds vs milliseconds:** Confirmed centiseconds (0–99). Format is `HH:MM:SS:cs`.

## Notes

### 2026-06-14 — implementation

- Added `apps/web/components/ui/animated-bar.tsx` — `<AnimatedBar />` component. Fixed to `position: fixed; bottom: 0; left: 0; right: 0; h-[2px]`. Accepts `className`, `variant` ('accent' | 'warning' | 'destructive' | 'success'), and `color` (raw CSS override). Animation: CSS `@keyframes hud-bar-sweep` — 3s linear left-to-right gradient sweep. Self-contained (keyframes inlined via `<style>`). No sign-in-specific coupling; drop-in reusable on any page.
- Added `apps/web/components/hud/LiveClock.tsx` — `<LiveClock />` component. Runs `setInterval` at 10ms. Formats `Date` as `HH:MM:SS:cs` where `cs = Math.floor(ms / 10)`. Timezone label derived from `Intl.DateTimeFormat().resolvedOptions().timeZone` — IANA zone parsed to a short `XX City` label (e.g. `Asia/Manila` → `PH Manila`) via a city-to-country lookup table. SSR-safe: renders `--:--:--:--` placeholder on server/before hydration to prevent layout shift. `aria-live="off"` to prevent screen-reader spam.
- Modified `apps/web/app/(auth)/login/_LoginForm.tsx` — moved `<WarningCounter>` from above the form to below the ACCESS button (per Figma node 346-47). Added `<LiveClock />` below the counter. Added `<AnimatedBar variant="accent" />` fixed to viewport bottom. No changes to lockout logic, CSRF flow, or server integration — full regression safety maintained.
- Files: 2 added, 1 modified
- Commits: pending (no commits requested)
- Open Questions resolved: Bar animation style defaulted to slow left-to-right gradient sweep (no Figma motion spec visible in static frame). LiveClock placed in `components/hud/` (auth-page use only for now; easy to promote to `components/ui/` if dashboard needs it).
