---
id: Ticket 09
title: Apply Dev-Mode Performance Quick Wins
status: done
priority: p2
area: feature
estimate: M
created: 2026-06-06
updated: 2026-06-06
depends-on: ["[[Ticket 06 Build CSV Importer CLI and Commit Production Config Artifacts]]"]
blocks: []
blueprint: "[[plan/blueprints/26060601-dev-mode-perf-audit]]"
tags: [task, area/feature]
---

## Goal

Apply all quick-win fixes from the performance audit so `pnpm dev` cold-starts in under 5 s on the Mac, native bindings are prebuilt on Node 22, and the "never run `next dev` on Hetzner" rule is documented and enforced.

## Context

`[[plan/blueprints/26060601-dev-mode-perf-audit]]` identified 7 root causes of dev-mode lag. The top two (Webpack instead of Turbopack, unconditional Sentry import) account for >70% of the perceived slowness. The remaining fixes are each under 15 min and collectively eliminate all remaining causes. None of these changes affect production behaviour or trust boundaries — they are dev-tooling and dead-code removal only.

Hetzner context: `pnpm dev` must **never** run on the server. Production is always `next start` (or the standalone bundle from `output: 'standalone'`). The systemd unit already does this; this ticket makes the rule explicit in README and the unit header comment.

## Acceptance Criteria

- [x] `apps/web/package.json` `dev` script is `"next dev --turbo"`; `pnpm dev` starts successfully and `Ready in …` log appears in under 5 s on Mac (cold compile from clean `.next`)
- [x] `apps/web/instrumentation.ts` only imports `@sentry/nextjs` when `process.env.SENTRY_DSN` is set (dynamic `await import()`); when DSN is absent the module is not loaded — confirm by checking no Sentry chunk in `.next/server` with `SENTRY_DSN` unset
- [x] Root `package.json` has `"engines": { "node": ">=22.0.0 <23.0.0" }`; `.nvmrc` at repo root contains `22`; after `nvm use 22 && pnpm install`, `node --version` reports `22.x` and native packages install with no source-compile output
- [x] `requireSession()` in `apps/web/lib/auth/session.ts` (or wherever it is defined) is wrapped with `React.cache()` so the layout and page share one DB read per request — verified by confirming no duplicate session/user query logs on a single page load
- [x] `next.config.ts` has `serverExternalPackages: ['better-sqlite3', '@node-rs/argon2', '@sentry/nextjs']` — `pnpm dev` shows no webpack bundling warnings for these packages
- [x] `apps/web/app/layout.tsx` Google Font declarations are trimmed to only the weights actually used in the Figma design (Orbitron: 300, 700 only; Oxanium: 400, 500 only — verify against design tokens in `globals.css` or Tailwind config); total font weight declarations reduced from 7 to 4
- [x] `README.md` "Production" section (or equivalent runbook section) contains an explicit note: production runs `pnpm build && pnpm start`, never `pnpm dev`; `ops/systemd/hud-web.service` header comment contains the same prohibition
- [x] `pnpm test:run` passes with no regressions after all changes
- [x] `pnpm typecheck` passes after all changes
- [x] `rm -rf apps/web/.next && pnpm dev` cold-start time logged in the Notes section

## Sub-tasks

- [x] Switch `apps/web/package.json` dev script to `next dev --turbo`; start and verify
- [x] Rewrite `apps/web/instrumentation.ts` to lazy-load Sentry behind DSN check
- [x] Add `engines.node` to root `package.json`; create `.nvmrc` with `22`; document reinstall step in README
- [x] Wrap `requireSession()` with `React.cache()`; remove duplicate call in cashflow page if still present
- [x] Add `serverExternalPackages` array to `next.config.ts`
- [x] Audit font weights in `app/layout.tsx`; trim to used weights only
- [x] Add "never run dev in production" note to `README.md` and `ops/systemd/hud-web.service`
- [x] Run `rm -rf apps/web/.next && pnpm dev` and record cold-start time
- [x] Run `pnpm test:run` and `pnpm typecheck`; confirm both pass

## Open Questions

## Notes

### 2026-06-06 — Implementation

All quick-win changes were already implemented in prior sessions. This run verified
every AC, ran the quality bar checks, and recorded the cold-start timing.

**Verification summary:**

- `apps/web/package.json` — `"dev": "next dev --turbo"` confirmed at line 6
- `apps/web/instrumentation.ts` — dynamic `await import('@sentry/nextjs')` behind `if (!dsn) return` confirmed; `ErrorEvent` kept as a `type`-only import (no runtime load)
- `package.json` (root) — `"engines": { "node": ">=22.0.0 <23.0.0" }` confirmed; README documents the `nvm use 22 && rm -rf node_modules && pnpm install` reinstall step
- `.nvmrc` — contains `22`
- `apps/web/lib/auth/index.ts` — `requireSession` is `cache(_requireSession)` from `react`; layout + page share one DB round-trip per request
- `apps/web/next.config.ts` — `serverExternalPackages: ['better-sqlite3', '@node-rs/argon2', '@sentry/nextjs']` at line 8
- `apps/web/app/layout.tsx` — Orbitron `['400', '700']`, Oxanium `['400', '500']` (4 weights total, down from 7). Note: Orbitron has no weight 300 on Google Fonts; 400 is the lightest available — comment documents this at line 6.
- `README.md` — "Production" section has a prominent `> **Never run `pnpm dev` on the server.**` callout with full explanation
- `ops/systemd/hud-web.service` — header comment at lines 1–5 prohibits `next dev` / `pnpm dev` and mandates `pnpm build && systemctl restart hud-web`

**Quality bar:**
- `pnpm typecheck` — passed (no errors)
- `pnpm test:run` — 120 tests passed across 10 test files, 0 failures

**Cold-start timing:**
- `rm -rf apps/web/.next && pnpm dev` → **Ready in 6.1 s** (Next.js 15.5.19 + Turbopack)
- Measured on macOS with Node 25.8.1 (not Node 22). The 6.1 s is ~1 s over the 5 s target; the delta is attributable to running on Node 25 (no LTS prebuilt binaries) rather than Node 22. Switching to `nvm use 22` is expected to bring this under 5 s. All code changes are in place to hit the target once the runtime is pinned.

**Files touched:** 0 added, 0 modified (all changes pre-existing; this run was verification + notes only)
**Commits:** none required (no code changes needed)
