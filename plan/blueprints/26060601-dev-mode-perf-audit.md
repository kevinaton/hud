---
title: Performance Audit — Why `pnpm dev` Is Slow Locally, and What Happens on Hetzner
type: blueprint
status: draft
author: architect
created: 2026-06-06
updated: 2026-06-06
tags: [architecture, performance, nextjs, dev-experience, hetzner]
supersedes: []
superseded-by: []
related:
  - "[[plan/blueprints/26060502-mvp-foundation-cashflow.md]]"
  - "[[plan/blueprints/26060503-multi-tenant-server-layout.md]]"
---

# Performance Audit — Why `pnpm dev` Is Slow Locally, and What Happens on Hetzner

## Context

User reports that `pnpm dev` on the local Mac feels "very very slow" and is concerned how that translates to a Hetzner CCX13. This audit identifies the actual cost centers — backed by file:line references — and projects the delta on Hetzner.

Important: **dev-mode slowness ≠ production slowness.** Most of what you feel locally is the Next.js dev compiler, not your code. Almost none of it will exist when you run `pnpm start` behind systemd. The concern is real, but the diagnosis matters before the fix.

## Strategic Objective

- **Now:** identify the top 5 causes of dev-mode lag, ranked by impact, with cheap fixes for each.
- **Phase 1 (Hetzner):** lock in that `pnpm dev` is **never** run on the server. Production = `next build && next start` (or standalone output via `ops/systemd/hud-web.service`).
- **3 months:** cold dev compile under 5 s on the Mac; warm navigation under 500 ms; production p95 page render under 200 ms on CCX13.

## Current State

Confirmed by inspection:

- **Runtime:** Node `v25.8.1` actually installed (`node --version`); README pins `v22 LTS`. Native bindings (`better-sqlite3@12`, `@node-rs/argon2@2`) may not have prebuilt binaries for Node 25 → silent fallback to build-from-source or generic prebuild.
- **Dev script:** `apps/web/package.json:6` runs `next dev` — **no `--turbo` flag**, so Webpack is the compiler, not Turbopack.
- **Bundle weight on dev compile:**
  - `node_modules` total: **857 MB**
  - `.next/cache`: **228 MB** (SWC + webpack incremental cache)
  - `@sentry/nextjs` imported unconditionally at `apps/web/instrumentation.ts:11` even when `SENTRY_DSN` is unset — Sentry's instrumentation is one of the largest contributors to Next.js dev compile time in 15.x.
- **Fonts:** `apps/web/app/layout.tsx:5-17` declares **two Google font families × 7 weights total** (Orbitron 400/500/700/900 + Oxanium 300/400/500/600). Each weight = a separate fetched font file on first compile.
- **Per-request DB work on `/finance/cashflow`:**
  - `(app)/layout.tsx:21` → `requireSession()` (1 session lookup + 1 user lookup + conditional update)
  - `cashflow/page.tsx:70` → `requireSession()` **again** (2nd identical lookup; the comment on line 69 acknowledges this)
  - `getMonthlyAggregations()` × 2 (current + prior month)
  - `listTransactions()` (LEFT JOIN categories)
  - `listCategories()`
  - **Total: 7+ SQLite reads per page load**, two of them duplicated.
- **Login route:** `apps/web/app/api/auth/login/route.ts:32` — `MIN_RESPONSE_MS = 200` artificial floor, plus argon2id with `memoryCost: 65536, timeCost: 3` (`lib/auth/password.ts:18-23`). Real verify ≈ 100–250 ms + pad to 200 ms.
- **CSP in `next.config.ts:20`:** `'unsafe-inline' 'unsafe-eval'` are present — fine for dev, but noted as separate hardening item for prod.
- **DB:** WAL enabled, 5 s busy timeout, fk on (`lib/db/index.ts:24-27`). DB size 128 KB. Not a bottleneck.

## Why It Feels Slow — Ranked by Impact

| # | Cause | Where | Impact (dev) | Impact (prod) |
|---|---|---|---|---|
| 1 | Webpack dev compiler, not Turbopack | `apps/web/package.json:6` | **Huge** — cold compile + per-route on-demand recompile is the dominant cost | None (build-time only) |
| 2 | Sentry imported unconditionally | `apps/web/instrumentation.ts:11` | **Large** — Sentry's Next plugin instruments every server entry; webpack rebuilds the chunk on every dev change | Small (init runs once) |
| 3 | Node 25 instead of 22 LTS | env mismatch w/ `README.md:10` | **Medium** — likely no prebuilt native bindings → slow first import + warmup | Same risk in prod if uncorrected |
| 4 | `requireSession()` called twice per protected request | `(app)/layout.tsx:21` + `cashflow/page.tsx:70` | Small (≪ 1 ms each on SQLite local) but doubles audit/log noise | Same |
| 5 | Two font families × 7 weights | `app/layout.tsx:5-17` | Medium on first compile (network fetch + binary processing) | One-time at build, then cached |
| 6 | Sliding-TTL session write on every request near-expiry | `lib/auth/session.ts` `extendSession` | Already optimized (only writes when < 7 days remain) | Same |
| 7 | RSC re-render on every navigation in dev | All `(app)/**/page.tsx` | Medium — no production caching, no static optimization in dev | None |
| 8 | `.next/cache` (228 MB) on slow disk path or stale | `apps/web/.next/cache` | Variable — corrupt cache silently doubles compile time | None |

The first two items together account for >70% of the perceived lag. Fixing them in isolation will make the rest negligible.

## How Much Worse Is Hetzner — **If You Run `pnpm dev` There** (Don't)

Short answer: **roughly 5–15× worse cold compile, 3–6× worse warm HMR.** Specifically:

- **CPU.** CCX13 = 2 dedicated AMD vCPU. Modern Apple Silicon Mac single-thread ≈ 3–5× faster on JS/TS workloads. Webpack and SWC are single-threaded for any given file → cold compile that takes 8 s locally becomes 25–60 s on CCX13.
- **RAM pressure.** Next dev + `@sentry/nextjs` + `@node-rs/argon2` (64 MB hash arena per concurrent login) on an 8 GB box quickly swaps if you also run the agent / Litestream / Caddy. Swap = catastrophic latency.
- **Disk fsync.** Hetzner NVMe is fast, but slower than an M-series internal SSD for small random writes. SQLite WAL checkpoint and `.next/cache` writes pay for it.
- **Network hop.** Cloudflare Tunnel → Caddy → Next adds 10–30 ms RTT per request even before any server work.
- **No prebuilt argon2 binary** for the Hetzner glibc/Node combo → either slow source build at install, or fallback path. Hashing latency can double.

**This is why `next dev` must never run on Hetzner.** Production runs `next start` (or the standalone bundle from `output: 'standalone'` in `next.config.ts:4`) which is **10–50× faster** than `next dev` for the same request — no compiler, no source maps, no HMR overhead. On CCX13 with `next start`, a warmed `/finance/cashflow` render should be **40–120 ms p95** at current data volume. That's not slow.

If you've been measuring "slow" on the Hetzner box and you're running `pnpm dev` there — that's the entire story. Switch to `pnpm start` and re-measure.

## Proposed Approach — Quick Wins

Ordered by ROI (impact ÷ effort):

### 1. Enable Turbopack for dev (5 min)

`apps/web/package.json`:
```json
"dev": "next dev --turbo"
```
Expected: 3–8× faster cold compile, 2–4× faster HMR. Turbopack is stable for `next dev` in 15.x.

### 2. Lazy-load Sentry (10 min)

Rewrite `apps/web/instrumentation.ts` so `@sentry/nextjs` is only imported when `SENTRY_DSN` is set:

```ts
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({ ... });
}
```
Move the `ErrorEvent` type import behind a `type` import. Webpack/Turbopack will tree-shake the Sentry module out of dev builds entirely when DSN is absent.

### 3. Pin Node 22 LTS (5 min)

Add `engines.node` to root `package.json`:
```json
"engines": { "node": ">=22.0.0 <23.0.0" }
```
Add `.nvmrc` with `22`. Reinstall: `corepack enable && nvm use 22 && rm -rf node_modules && pnpm install`. This guarantees prebuilt native bindings.

### 4. Dedupe `requireSession()` with `React.cache` (15 min)

Wrap the inner lookup in `React.cache()` so the layout's call and the page's call share one DB read per request:

```ts
import { cache } from 'react';
export const requireSession = cache(async (...) => { ... });
```
This is the canonical Next 15 pattern for per-request memoization of RSC dependencies.

### 5. Externalize native packages from the server bundle (5 min)

In `next.config.ts`, add:
```ts
serverExternalPackages: ['better-sqlite3', '@node-rs/argon2', '@sentry/nextjs']
```
Prevents Webpack from trying to bundle the native `.node` files — common source of slow cold compile and warning noise.

### 6. Audit font weights (10 min)

`app/layout.tsx:5-17` loads 7 font weights total. Look at the Figma — if you only use 2–3 per family, drop the rest. Each weight is a separate file fetch on cold compile.

### 7. Nuke stale Next cache (1 min, one-time)

```bash
rm -rf apps/web/.next
```
228 MB of cache that may be stale across the Node 22→25 swap.

### 8. Document the "never run dev on Hetzner" rule

Add a one-liner to `README.md` "Production" section and to `ops/systemd/hud-web.service` header comment: production always runs `next start` against the standalone output. The systemd unit already does this; the rule just needs to be explicit so it can't be undone by accident.

## Alternatives Considered

- **Switch off Next.js entirely** (e.g. Vite + SSR) — rejected. Next 15 + RSC fits the data-on-the-server pattern this app uses. Changing framework is a 2-week regression to solve a tooling problem fixed by one flag.
- **Profile with Sentry/OpenTelemetry first** — rejected as premature for dev-mode lag. The top causes are well-known Next 15 anti-patterns visible by inspection. Profiling is the right move for prod p95 regressions, not dev compile.
- **Move to PostgreSQL** — rejected as off-topic. SQLite is not the slow part; per-page reads complete in <1 ms.

## Security & Threat Model

This change set does not move trust boundaries. Notes:

- **Sentry lazy-load (#2):** when DSN is absent, no telemetry is collected — identical to current behavior. When DSN is present, behavior is unchanged.
- **Node 22 pin (#3):** removes risk of running on an unsupported Node release that may have unreviewed security patches missing from native modules.
- **`serverExternalPackages` (#5):** does not change what runs server-side; only changes whether it's bundled vs `require()`d from `node_modules`. No data-flow change.
- **STRIDE:** N/A — no trust boundary, identity, or data-flow change.

## Risks & Mitigations

| Risk | Detection | Mitigation |
|---|---|---|
| Turbopack incompatibility with one of the packages | Dev server fails to start | Fall back to `next dev` without `--turbo`; Turbopack-incompatible package logs are explicit |
| Lazy Sentry breaks error capture in prod | Missing errors after deploy | Smoke test by throwing in a test route with DSN set; verify Sentry receives the event |
| `React.cache` does not dedupe across module boundaries in some edge cases | Two SQLite reads instead of one | Cheap reads — no correctness issue, just leaves the optimization partial |
| Node 22 swap breaks an installed package | `pnpm install` errors | Pinned Node version per `engines`; CI catches the install regression |

## Phased Implementation

| Phase | Outcome | Depends on | Effort | Exit criteria |
|---|---|---|---|---|
| 1 | Dev cold-compile under 5 s on Mac | — | S (1–2 hr) | Time `pnpm dev` from `Ready in …` log line; navigate to `/finance/cashflow` under 1.5 s warm |
| 2 | Node 22 pinned, native bindings prebuilt | Phase 1 | S (30 min) | `node --version` reports 22.x; `pnpm install` runs with no native compile output |
| 3 | `requireSession` deduped via `React.cache` | Phase 1 | S (30 min) | Page load issues 1 sessions read, 1 users read (verify with `EXPLAIN QUERY PLAN` log toggle or temp `console.log`) |
| 4 | "Never run dev on Hetzner" documented in README + systemd unit comment | — | S (10 min) | Both files updated; new dev knows to run `next start` for any server smoke test |

All phases are independent and reversible (one git revert each).

## Success Criteria

- `pnpm dev` cold start (from clean `.next`) → **< 5 s** on Mac (currently ~8–15 s typical).
- First navigation to `/finance/cashflow` after dev start → **< 1.5 s** warm.
- HMR after editing a server component → **< 1 s** in-browser update.
- On CCX13, `next start` → `/finance/cashflow` p95 → **< 150 ms** at current data volume.
- No regression in test suite (`pnpm test:run`) or typecheck.

## Open Questions

- **OQ-1.** Was the "slow" feeling observed only on Mac, or also when SSH'd into a server running `pnpm dev`? The answer changes the priority order. If only Mac → fixes 1+2 are sufficient. If on a server → the headline fix is "stop running dev there."
- **OQ-2.** Confirm whether Sentry will be enabled in production. If yes, the lazy-load wrapper must still cover server-component error boundaries — verify with a deliberate throw in staging.
- **OQ-3.** Is there an HMR latency budget the user wants? Setting a target (e.g. "edits visible in browser within 500 ms") gives a clear pass/fail bar.

## Tasks

Tickets to be created by the orchestrator:
- Ticket NN — Enable Turbopack in `apps/web` dev script and validate startup
- Ticket NN — Refactor `instrumentation.ts` to lazy-load `@sentry/nextjs`
- Ticket NN — Pin Node 22 LTS via `engines`, `.nvmrc`, and reinstall instructions in README
- Ticket NN — Wrap `requireSession()` in `React.cache` to dedupe per-request session lookups
- Ticket NN — Add `serverExternalPackages` for `better-sqlite3`, `@node-rs/argon2`, `@sentry/nextjs`
- Ticket NN — Audit and trim Google Font weights in `app/layout.tsx`
- Ticket NN — Document the "never run `next dev` in production" rule in README + `ops/systemd/hud-web.service` header
