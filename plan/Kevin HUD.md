## Goal
A single-server personal HUD (Hetzner Ubuntu) that combines an agentic second brain, finance dashboard, and workflow automation. Operated primarily through SSH + CLI agents, secondarily through Telegram, and eventually a web dashboard at `hud.kevinaton.com`.

## Architecture (4 Layers + Edge)

### Layer 0 — Edge (Cloudflare)
- Cloudflare Tunnel (`cloudflared`) — server has no public IPs
- Cloudflare Access — SSO + MFA for `hud.kevinaton.com`
- DNS, SSL, edge caching

### Layer 1 — Gateways
- **SSH + CLI** — primary, day-one interface
- **Telegram bot** — remote command interface
- **HUD** — read-only at MVP; chat panel added later
- **Portfolio** — hosted separately, out of scope

### Layer 2 — Multi-Agent Runtime
- Claude CLI / Gemini CLI / Opencode CLI as interchangeable model backends
- Rate-limit-aware routing: cheap model first (Gemini free), escalate to Claude when needed
- Shared skills, shared vault, shared database across all agents

### Layer 3 — Tools
- **Skills** — versioned in git, hot-reloadable
- **MCP servers** — vault-api, sqlite-mcp, finance-mcp (one per resource)
- **Scripts / CLIs / APIs** — executables agents can call
- **Orchestration** — agent-native loops and schedules (Claude `/loop`, `schedule` skill)
- **Redis** — cache, job queue, pub/sub

### Layer 4 — Memory & Database
- **SQLite** + Litestream → Cloudflare R2 (continuous replication)
- **Obsidian vault** (folder of markdown) + Syncthing → mobile
- **Vector store** — deferred to Phase 3+ if semantic search becomes a recurring pain point. SQLite FTS5 is sufficient until then.
- **Redis** — ephemeral state, session cache

## Memory Model

| SQLite | Obsidian Vault |
|---|---|
| Transactions, balances, holdings | Monthly finance reports, narrative summaries |
| Agent run logs, token usage, audit trail | Research notes, daily journal, decisions |
| Telegram message log | Project plans, long-form docs |
| Kanban card status / IDs | Kanban card bodies (long-form) |
| Auth, sessions, preferences | Anything with backlinks or graph value |

**Rule:** *"Will I revisit this as a story or as a number?"* — story → vault, number → SQLite.

## Tech Stack

| Concern | Pick |
|---|---|
| Server | Hetzner CCX13, Ubuntu LTS |
| Ingress | Caddy |
| Edge | Cloudflare Tunnel + Access |
| Process supervision | systemd (infra), agents handle own loops |
| Database | SQLite + Litestream |
| Vault sync | Syncthing |
| Cache / queue | Redis |
| Secrets | sops + age |
| Observability | Sentry + Uptime Kuma |
| Backups | Litestream → R2 or Hetzner Storage Box; vault → git mirror |
| Agents | Claude CLI, Gemini CLI, Opencode CLI |

## Roadmap

| Phase             | Scope                                                                  | Status      |
| ----------------- | ---------------------------------------------------------------------- | ----------- |
| **0 — MVP**       | Foundation + Auth + Cashflow page (local-first, cloud-ready)           | 🔲 Building |
| **1 — Remote**    | Telegram bot gateway + Hetzner deploy (Caddy / cloudflared / CF Access) | 🔲 Planned  |
| **2 — Knowledge** | Research + Notes + Vault + Syncthing → phone (Obsidian Mobile)         | 🔲 Planned  |
| **3 — Workflow**  | Kanban module, agent routines, MCP servers (finance-mcp, vault-api)    | 🔲 Planned  |
| **4 — Web Chat**  | Dashboard chat panel, agent-api service                                | 🔲 Planned  |
| **5 — Public**    | Portfolio guest agent (separate hosting)                               | 🔲 Planned  |

## MVP — Foundation + Cashflow (Phase 0)

**Local-first build.** We stand up the full HUD stack on the laptop, then promote to Hetzner in Phase 1. Production posture (Caddy / cloudflared / CF Access / Litestream / sops) is configured and committed in MVP but not deployed until Phase 1.

**In scope:**
- Repo + monorepo scaffold (Next.js + Tailwind + shadcn/ui)
- Cyberpunk HUD design system (Orbitron / Oxanium, cyan accent `#0FB8C9`, hazard-stripe dividers, grid overlay) — see `plan/blueprints/26060502-mvp-foundation-cashflow.md`
- SQLite schema: `users`, `sessions`, `categories`, `transactions`, `audit_log` (money stored in minor units as `INTEGER`)
- App-level authentication: sign-up (env-gated, single-user mode), login, server-side sessions, rate limit, failed-attempt lockout (matches the "Warning Attempts" UI)
- Finance > Cashflow page (read + add transaction) per Figma `node-id=309-631`
- Login screen per Figma `node-id=305-2391`
- CSV importer CLI (one-off; legacy data from `db backups/cashflow_export.csv` loaded in Phase 1 after cloud deploy)
- Production config artifacts (Caddyfile, cloudflared tunnel config, CF Access policy, Litestream config, sops + age, systemd units) — checked in, not deployed
- Audit log table populated from day one
- Sentry wired (no-op DSN locally is fine)

**Out of scope for MVP:**
- Hetzner deploy, Cloudflare Tunnel runtime, CF Access policy enforcement (Phase 1)
- Vault + Syncthing → phone, monthly Obsidian reports (Phase 2)
- Telegram bot, HUD chat, Research / Kanban / Notes modules, portfolio agent
- MCP servers (`finance-mcp` etc.), agent skills (`categorize-transaction`, `monthly-report`, …)
- Budgets, holdings, multi-currency conversion, anomaly detection

**Data rules (from day one):**
- Categories are normalized strings. **No emoji** in `categories.name` (importer strips them — `🛌 Airbnb` → `Airbnb`).
- Amounts stored as signed `INTEGER` in minor units (centavos for PHP). Never floats.
- Every write to `transactions`, `categories`, `users` writes one row to `audit_log`.

## Operational Rules (from day one)
- Backups (Litestream) live before any real finance data goes in
- Secrets in sops + age — never in committed `.env`
- Sentry on every agent process
- Audit log table in SQLite for every agent write action
- One vault, one DB, one skills tree — no per-agent forks

---

*Architecture designed June 2026. See `HUD Architecture.canvas` for visual map.*
