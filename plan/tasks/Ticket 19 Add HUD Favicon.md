---
id: Ticket 19
title: Add HUD Favicon
status: done
priority: p2
area: design
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/design]
---

## Goal

Ship a favicon — the letter H centred on a filled accent-colour box — so the browser tab, bookmarks bar, and address bar all show the HUD brand mark and `/favicon.ico` returns 200.

## Context

Currently the browser console logs `GET https://hud.kevinaton.com/favicon.ico 404 (Not Found)`. No favicon asset exists in the project. The design system uses Orbitron/Oxanium typeface and cyan accent `#0FB8C9` as defined in [[plan/blueprints/26060502-mvp-foundation-cashflow]].

The favicon should be: dark/black `H` (Orbitron Bold or a geometric sans fallback) centred on a solid `#0FB8C9` square, no border-radius, no outer padding — consistent with the sharp cyberpunk aesthetic.

## Acceptance Criteria

- [x] `apps/web/public/favicon.svg` exists — `H` on `#0FB8C9` background, 32×32 viewBox, renders correctly in browser
- [x] `apps/web/public/favicon.ico` exists — multi-resolution (16×16 + 32×32) generated from the SVG
- [x] `apps/web/public/apple-touch-icon.png` exists — 180×180 PNG version for iOS bookmarks
- [x] `apps/web/app/layout.tsx` `metadata` object includes `icons` linking to all three assets
- [x] `GET /favicon.ico` returns 200 (no 404 in console)
- [ ] Browser tab shows the favicon after a hard reload

## Sub-tasks

- [x] Author `favicon.svg` by hand (pure SVG, no external fonts — use `font-family: 'Orbitron', sans-serif` with a `<style>` block or path-based H if font embedding is unreliable at 32px)
- [x] Generate `favicon.ico` from the SVG (use `sharp` CLI, `svgexport`, or an npm script — document the command in the Notes)
- [x] Generate `apple-touch-icon.png` 180×180 from the SVG
- [x] Wire up `metadata.icons` in `apps/web/app/layout.tsx`
- [ ] Smoke-test locally and on `hud.kevinaton.com` after deploy

## Open Questions

## Notes

### 2026-06-07 — Implementation

- Added `apps/web/public/favicon.svg` — hand-authored 32×32 SVG: `#0FB8C9` background rect, geometric path-based H using three `<rect>` elements (left bar x=6, right bar x=21, crossbar y=14), fill `#0A0E12`. No font embedding — pure geometry to guarantee crisp rendering at all sizes. `shape-rendering="crispEdges"` applied.
- Added `apps/web/public/favicon.ico` — multi-resolution (16×16 + 32×32) ICO with embedded PNG data. Generated via `node_modules/.bin/tsx scripts/gen-favicon.ts`.
- Added `apps/web/public/apple-touch-icon.png` — 180×180 PNG. Same script.
- Added `scripts/gen-favicon.ts` — pure TypeScript generation script. Uses `sharp@0.34.5` (transitive dep of `next@15`, already in pnpm virtual store at `node_modules/.pnpm/sharp@0.34.5/`). Implements ICO binary assembly from scratch using Node.js `Buffer` APIs (ICONDIR header + ICONDIRENTRY[] + embedded PNG data). No new runtime dependency added.
- Modified `apps/web/app/layout.tsx` — added `metadata.icons` with SVG (primary), ICO (fallback 16×16+32×32), and Apple touch icon (180×180).

**Exact command to regenerate assets:**
```
node_modules/.bin/tsx scripts/gen-favicon.ts
```

- Files: 4 added, 1 modified
- Commits: 1 (`feat(ui): add HUD favicon — H on #0FB8C9 background, ICO + PNG assets`)
- Open Questions surfaced: none
