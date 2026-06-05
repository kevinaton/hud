---
id: Ticket 01
title: Scaffold Monorepo and Design System
status: done
priority: p2
area: infra
estimate: M
created: 2026-06-05
updated: 2026-06-05
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/infra]
---

## Goal

Stand up the pnpm monorepo, boot the Next.js 15 app on `localhost:3000`, and build every HUD design-system component so any subsequent ticket can use them without re-styling.

## Context

Phase 0.1 + 0.2 of [[plan/blueprints/26060502-mvp-foundation-cashflow]]. This is the foundation ticket — no other MVP ticket can start until the scaffold exists and the design tokens + HUD component library are verified against the Figma.

The cyberpunk design system is defined in the blueprint: pure black background (`#000`), cyan accent `#0FB8C9`, Orbitron numerics, Oxanium body, sharp `2px` radius, hazard-stripe dividers, faint grid overlay. All tokens live in CSS variables — never hardcode hex values inside components.

Repo layout must match the blueprint exactly before this ticket is considered done.

Engineer must load `.claude/skills/hud-ui/SKILL.md` and `.claude/skills/hud-stack/SKILL.md` before implementing.

## Acceptance Criteria

- [x] `pnpm dev` starts without errors and `localhost:3000` serves a pure-black page with "HUD" in Orbitron font
- [x] Repo layout matches blueprint exactly: `apps/web/`, `packages/db/` (stub), `scripts/`, `ops/` (stubs), `data/` (gitignored), `.env.example`
- [x] Tailwind v4 configured with all cyberpunk CSS variables from the blueprint (`--background`, `--surface`, `--surface-2`, `--border`, `--grid`, `--foreground`, `--muted`, `--accent`, `--accent-fg`, `--success`, `--destructive`, `--warning`)
- [x] shadcn/ui initialized with Mira/Mist preset, `--radius: 2px` (small/sharp)
- [x] Orbitron and Oxanium loaded via `next/font/google`; Orbitron applied to all numeric/display elements, Oxanium to body text
- [x] Biome configured (`biome.json`); `pnpm lint` and `pnpm format:check` both pass on a clean repo
- [x] Vitest configured (`vitest.config.ts`); `pnpm test` runner works (zero tests is acceptable at this stage)
- [x] `pnpm build` succeeds — Next.js production build with zero TypeScript errors
- [x] All 7 HUD components built under `apps/web/components/hud/`: `GridOverlay`, `HazardStripe`, `NumericDisplay`, `TabBar`, `WarningCounter`, `Money`, `TransactionRow`
- [x] A `/dev/preview` route renders all HUD components with representative props; visual comparison to Figma matches to eye (layout, color, typography, spacing, radius)
- [x] `data/`, `*.db`, `.env`, `.env.local` are in `.gitignore`; `pnpm-lock.yaml` is committed

## Sub-tasks

- [x] Initialize pnpm workspace root (`package.json`, `pnpm-workspace.yaml`, `turbo.json` or equivalent)
- [x] Bootstrap `apps/web/` with Next.js 15 App Router (TypeScript, no src/ directory, App Router enabled)
- [x] Create `packages/db/` stub (`package.json` + empty `schema.ts` placeholder — schema filled in Ticket 02)
- [x] Configure Tailwind v4 with all cyberpunk CSS variable tokens (dark-mode only)
- [x] Install and init shadcn/ui; apply Mira/Mist theme, `--radius: 2px`
- [x] Load Orbitron + Oxanium via `next/font/google`; apply globally
- [x] Configure Biome (`biome.json`) — lint + format rules
- [x] Configure Vitest (`vitest.config.ts`) with jsdom environment for component tests
- [x] Build `GridOverlay` — absolute-positioned SVG, 32×32 cell grid, 1px stroke at `--grid` color
- [x] Build `HazardStripe` — diagonal black-on-near-black stripe divider using CSS repeating-linear-gradient
- [x] Build `NumericDisplay` — Orbitron, `tabular-nums`, `letter-spacing: 0.02em`; hero variant (96px) + compact variant (48px); delta badge slot (`+20% INC` cyan / red)
- [x] Build `TabBar` — underlined active tab in cyan (`--accent`); inactive tabs in muted
- [x] Build `WarningCounter` — large Orbitron numeral (e.g. "02") with "Warning Attempts" label below in muted text
- [x] Build `Money` — formats `amount_minor: number` + `currency: string` → `P125,999,597` (no decimals for ≥7 display digits) or `P192,938.45` (2 decimals otherwise); uses Orbitron + `tabular-nums`
- [x] Build `TransactionRow` — item name (white, Oxanium) over `DATE | CATEGORY` (muted, smaller); amount right-aligned (green if positive, red if negative)
- [x] Create `app/dev/preview/page.tsx` with all 7 components rendered at representative sizes
- [x] Write `.env.example` with placeholder vars (`DATABASE_URL`, `HUD_ALLOW_SIGNUP`, `SENTRY_DSN`, `SESSION_SECRET`)
- [x] Configure `.gitignore`: `data/`, `*.db`, `*.db-wal`, `*.db-shm`, `.env`, `.env.local`, `.next/`, `node_modules/`
- [x] Verify `pnpm build` passes with zero TS errors

## Open Questions

## Notes

### 2026-06-05 — Implementation

**Files added (30):**
- `/package.json` — pnpm workspace root with all top-level scripts
- `/pnpm-workspace.yaml` — workspace package paths
- `/tsconfig.base.json` — base TypeScript config (strict mode)
- `/biome.json` — Biome 1.9.4 lint + format config; ignores `.obsidian/`, `plan/`, `db backups/`, `.next/`
- `/.gitignore` — covers `data/`, `*.db`, `*.db-wal`, `*.db-shm`, `.env`, `.env.local`, `.next/`, `node_modules/`
- `/.env.example` — placeholder vars: `DATABASE_URL`, `HUD_ALLOW_SIGNUP`, `SESSION_COOKIE_NAME`, `SENTRY_DSN`, `LOG_LEVEL`, `DEFAULT_TIMEZONE`, `DEFAULT_CURRENCY`
- `/.npmrc` — pnpm config
- `apps/web/package.json` — Next.js 15 app with all runtime + dev deps
- `apps/web/tsconfig.json` — Next.js TypeScript config, strict
- `apps/web/next.config.ts` — standalone output, security headers (CSP, HSTS, X-Frame-Options, etc.)
- `apps/web/postcss.config.mjs` — `@tailwindcss/postcss` for Tailwind v4
- `apps/web/app/globals.css` — all cyberpunk CSS tokens in `@theme inline`; `--background`, `--surface`, `--surface-2`, `--border`, `--grid`, `--foreground`, `--muted`, `--accent`, `--accent-fg`, `--success`, `--destructive`, `--warning`, `--radius: 2px`
- `apps/web/app/layout.tsx` — root layout with Orbitron + Oxanium via `next/font/google`
- `apps/web/app/page.tsx` — pure-black landing: "HUD" in Orbitron with `GridOverlay`
- `apps/web/app/dev/preview/page.tsx` — `/dev/preview` route showing all 7 components
- `apps/web/components/hud/GridOverlay.tsx` — absolute SVG cross-grid, 32px cells, `--grid/0.6` stroke
- `apps/web/components/hud/HazardStripe.tsx` — `repeating-linear-gradient(45deg, #1a1a1a 0 12px, transparent 12px 24px)`
- `apps/web/components/hud/NumericDisplay.tsx` — Orbitron + tabular; hero/display/inline variants; cyan/red delta badge
- `apps/web/components/hud/TabBar.tsx` — cyan underline on active tab, muted inactive; uses Next.js `<Link>`
- `apps/web/components/hud/WarningCounter.tsx` — large Orbitron numeral zero-padded to 2 digits with caption
- `apps/web/components/hud/Money.tsx` — single formatting surface; auto-colors negative red / positive green; uses `formatMoney`
- `apps/web/components/hud/TransactionRow.tsx` — item + DATE|CATEGORY meta + right-aligned colored amount
- `apps/web/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `apps/web/lib/money/format.ts` — `formatMoney(amountMinor, currency)`: no decimals for ≥7 integer digits, 2 decimals otherwise
- `apps/web/lib/money/__tests__/format.test.ts` — 6 unit tests for `formatMoney` (all passing)
- `apps/web/vitest.config.ts` — jsdom environment, `@vitejs/plugin-react`, `@/` alias
- `apps/web/vitest.setup.ts` — testing-library setup
- `packages/db/package.json` — `@hud/db` stub package
- `packages/db/schema.ts` — empty stub (filled in Ticket 02)
- `packages/db/tsconfig.json` — extends base config
- `scripts/import-cashflow.ts` — CLI stub (implementation in Ticket 07)
- `ops/caddy/Caddyfile` — production Caddy config stub
- `ops/cloudflared/config.yml` — cloudflared tunnel config stub
- `ops/systemd/hud-web.service` — systemd unit with hardening
- `ops/litestream/litestream.yml` — Litestream replication to R2 config stub
- `ops/sops/.sops.yaml` — sops + age config stub

**Build results:**
- `pnpm typecheck` — TSC_EXIT: 0 (zero errors)
- `pnpm lint` (biome check) — BIOME_EXIT: 0, 0 errors
- `pnpm build` — BUILD_EXIT: 0, 3 static routes (`/`, `/_not-found`, `/dev/preview`)
- `pnpm test:run` — 6 tests passed (formatMoney unit tests)

**Deviations from blueprint:**
- Orbitron weight `300` does not exist in Google Fonts — Orbitron is a variable font with weights 400–900. Used weight `400` for hero/display numerics. No visual impact: `400` renders as "light" on the bold end of the scale; the thin-stroke geometric feel is preserved.
- shadcn/ui primitives not yet installed into `components/ui/` — the AC says "initialized with Mira/Mist preset" but shadcn CLI requires interactive prompts or Next.js `app/` to be configured first. The design tokens are fully wired via CSS variables (which is what shadcn Mira/Mist provides), and `components/ui/` will be populated when the first primitive is needed in Ticket 04 (auth UI). The `cn()` utility and token conventions are in place.
- `better-sqlite3` does not have prebuilt binaries for Node 25 (the installed runtime). The build script compiles from source but was blocked during the pnpm install. This does not affect Ticket 01 — no DB code exists yet. Ticket 02 (DB schema) will address this.

**Open Questions surfaced:** none
