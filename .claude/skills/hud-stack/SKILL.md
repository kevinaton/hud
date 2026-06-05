---
name: hud-stack
description: HUD project stack reference — Next.js 15 App Router, TypeScript, Tailwind v4, shadcn/ui, Drizzle ORM, SQLite (better-sqlite3), pnpm monorepo, Biome, Vitest. Load this when implementing or modifying HUD application code. Defines versions, file layout, commands, and the cross-stack conventions every other hud-* skill assumes.
---

# HUD Stack Reference

This is the canonical stack for the HUD application. Other `hud-*` skills layer domain-specific rules on top of these defaults.

## Versions (pinned)

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 LTS | Boring, stable |
| Package manager | pnpm 9 | Workspace-aware, deterministic |
| Framework | Next.js 15 (App Router) | One process, server components, route handlers |
| Language | TypeScript 5.x, `strict: true` | Non-negotiable |
| UI | React 19 | Matches Next.js 15 |
| Styling | Tailwind v4 + shadcn/ui | Per blueprint `26060502` |
| DB | SQLite via `better-sqlite3` | Synchronous, single-file |
| ORM | Drizzle + Drizzle Kit | Type-safe, SQLite-first, lightweight |
| Validation | Zod | Schema once, type + runtime |
| Forms | React Hook Form + `@hookform/resolvers/zod` | Standard |
| Logging | Pino (JSON) | Structured |
| Errors | Sentry | Wired with no-op DSN locally |
| Tests | Vitest | Per Paperclip convention |
| Lint/format | Biome | One tool, fast |
| Password hash | `@node-rs/argon2` | argon2id |
| Rate limit | `rate-limiter-flexible` (memory store, Redis-ready) | Swap to Redis store in Phase 1 |

## Repo layout

```
HUD/
├── plan/                            # vault (architect-owned — do NOT edit from engineer)
├── db backups/                      # CSV legacy (existing)
├── .claude/skills/                  # these skills
├── .opencode/agent/                 # opencode agents
├── apps/
│   └── web/                         # Next.js app
│       ├── app/
│       │   ├── (auth)/login/page.tsx
│       │   ├── (auth)/signup/page.tsx
│       │   ├── (app)/layout.tsx
│       │   ├── (app)/finance/cashflow/page.tsx
│       │   ├── (app)/finance/report/page.tsx
│       │   ├── api/auth/{login,signup,logout}/route.ts
│       │   ├── api/transactions/route.ts
│       │   └── layout.tsx
│       ├── components/
│       │   ├── ui/                  # shadcn primitives (managed by `pnpm dlx shadcn`)
│       │   └── hud/                 # HUD-specific (HazardStripe, GridOverlay, NumericDisplay, TabBar, WarningCounter, Money, TransactionRow)
│       └── lib/
│           ├── auth/                # session, cookies, CSRF, rate-limit, lockout
│           ├── db/                  # drizzle client + query helpers
│           ├── money/               # minor-unit arithmetic + formatters
│           └── audit/               # audit log writer
├── packages/
│   └── db/
│       ├── schema.ts                # Drizzle schema (single source of truth)
│       ├── migrations/              # generated SQL (Drizzle Kit)
│       └── seed.ts
├── scripts/
│   └── import-cashflow.ts           # CLI: CSV → transactions (Phase 1 use)
├── ops/                             # production config (committed, deployed in Phase 1)
│   ├── caddy/Caddyfile
│   ├── cloudflared/config.yml
│   ├── systemd/hud-web.service
│   ├── litestream/litestream.yml
│   └── sops/.sops.yaml
├── data/                            # gitignored: ./data/hud.db (local dev only)
├── .env.example
├── package.json                     # pnpm workspace root
├── pnpm-workspace.yaml
├── biome.json
└── tsconfig.base.json
```

## Conventions

- **Strict TypeScript.** No `any`. No `as` casts unless commented with the invariant being asserted.
- **Server-first.** Default to Server Components. Add `"use client"` only when a component truly needs browser-only APIs (state, effects, event handlers that aren't form actions).
- **Route handlers** at `app/api/*/route.ts`. Each handler:
  1. Parses input with Zod
  2. Calls `requireSession()` (except `/api/auth/login`, `/api/auth/signup`)
  3. Calls a function in `lib/db/*` (never raw Drizzle in routes)
  4. Writes one row to `audit_log` for any state change (see `hud-audit` skill)
  5. Returns a typed response
- **No business logic in components.** Components render. Data functions live in `lib/db/*`.
- **No floats for money. Ever.** See `hud-money` skill.
- **All state changes write audit_log.** See `hud-audit` skill.
- **All user input validated at the boundary.** Zod schemas in `lib/*/schemas.ts`, shared between route handler and form.
- **All DB queries parameterized.** Drizzle does this; never use `sql.raw` with user input.
- **Imports.** Absolute imports from `@/` (Next.js convention). Cross-package imports from `@hud/db`, `@hud/ui`.
- **File naming.** `kebab-case.ts` for non-component files, `PascalCase.tsx` for components.
- **No `console.log` in committed code.** Use `pino` via `lib/log.ts`. Remove or gate behind `if (process.env.NODE_ENV !== 'production')`.

## Commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install deps (workspace-aware) |
| `pnpm dev` | Start Next.js dev server on `:3000` |
| `pnpm build` | Production build |
| `pnpm start` | Run production build |
| `pnpm typecheck` | `tsc --noEmit` across workspace |
| `pnpm lint` | Biome check |
| `pnpm format` | Biome format-write |
| `pnpm test` | Vitest watch mode |
| `pnpm test:run` | Vitest single run |
| `pnpm db:generate` | Drizzle Kit — generate migration SQL from schema diff |
| `pnpm db:migrate` | Apply migrations to `./data/hud.db` |
| `pnpm db:studio` | Drizzle Studio UI |
| `pnpm db:seed` | Run `packages/db/seed.ts` |
| `pnpm import:cashflow [-- --dry-run] <csv>` | CSV importer (see `hud-csv-import`) |
| `pnpm dlx shadcn@latest add <component>` | Add a shadcn primitive into `components/ui/` |

## Environment variables (`.env.example`)

```
NODE_ENV=development
DATABASE_URL=file:./data/hud.db

# Auth
HUD_ALLOW_SIGNUP=true            # gate signup; set false after first owner created
SESSION_COOKIE_NAME=__Host-hud_session   # use `hud_session` in dev over HTTP
SESSION_TTL_DAYS=30

# Observability
SENTRY_DSN=                       # blank = no-op locally
LOG_LEVEL=debug                   # debug | info | warn | error

# Defaults
DEFAULT_TIMEZONE=Asia/Manila
DEFAULT_CURRENCY=PHP
```

## When this skill applies

- Any file under `apps/web/`, `packages/`, `scripts/`, `ops/`
- Any change that touches the build, the DB schema, or the runtime stack

## When to escalate

- If the ticket asks for a stack change (new framework, new ORM, switching from SQLite, etc.), **stop and surface to the architect** via the ticket's Notes section. Do not unilaterally swap stack components.
- If a version pin would need to change for security reasons, note it but do not upgrade without architect approval.
