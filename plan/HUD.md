---
title: HUD — Mother Index
type: moc
role: index
status: living
author: architect
created: 2026-06-04
updated: 2026-06-07
tags: [moc, index, hud, strategy]
---

# HUD

> **Start here.** This is the mother file for the HUD build. Everything — strategy, architecture, active phase, blueprints, ADRs, references, tasks, skills — connects from this page. If you open one file, open this one first.

**Current phase:** **Phase 0 — MVP (Foundation + Cashflow)** — see [[26060502-mvp-foundation-cashflow]]
**Live board:** [[Kanban]]
**Visual map:** `HUD Architecture v2.canvas` (open in Obsidian)

---

## Goal

A single-server personal HUD (Hetzner Ubuntu) that combines an agentic second brain, finance dashboard, and workflow automation. Operated primarily through SSH + CLI agents, secondarily through Telegram, and eventually a web dashboard at `hud.kevinaton.com`.

## Architecture (4 Layers + Edge)

### Layer 0 — Edge (Cloudflare)
- Cloudflare Tunnel (`cloudflared`) — server has no public IPs
- Cloudflare Access — SSO + MFA for `hud.kevinaton.com`
- DNS, SSL, edge caching

### Layer 1 — Gateways
- **SSH + CLI** — primary, day-one interface. Operator `cd`s into `/srv/hud/agents/<persona>/` and runs `gemini` / `claude` / `opencode` — persona auto-loads, MCP auto-connects. See [[26060701-hud-agent-runtime-emily]].
- **Telegram bot** — remote command interface. **Deferred to Phase 4** (was Phase 1). Bridge will reuse the same persona + MCP server; no new business-logic path.
- **HUD** — read-only at MVP; chat panel added in Phase 4.
- **Portfolio** — co-located on the same box per [[26060503-multi-tenant-server-layout]] (revises original "out of scope")

### Layer 2 — Multi-Agent Runtime
- Claude CLI / Gemini CLI / Opencode CLI as interchangeable model backends — Emily (the first persona) runs identically on all three. See [[26060701-hud-agent-runtime-emily]].
- Rate-limit-aware routing: cheap model first (Gemini free), escalate to Claude when needed
- Shared skills, shared vault, shared database across all agents — persona is a swappable file, not a code branch
- See [[26060504-mvp-agent-strategy]]

### Layer 3 — Tools
- **Skills** — versioned in git, hot-reloadable. Runtime skills (agent behavior) live in `apps/web/agents/<persona>/skills/`; build-time skills (Builder agent guidance) live in `.claude/skills/`.
- **MCP servers** — `packages/mcp-hud` is the unified HUD MCP server with tool namespaces per domain (`cashflow.*` at MVP; `vault.*`, `calendar.*` added in later phases). One server, many namespaces. See [[26060701-hud-agent-runtime-emily]].
- **Scripts / CLIs / APIs** — executables agents can call
- **Orchestration** — agent-native loops and schedules (Claude `/loop`, `schedule` skill)
- **Redis** — cache, job queue, pub/sub

### Layer 4 — Memory & Database
- **SQLite** + Litestream → Cloudflare R2 (continuous replication) — see [[SQlite]]
- **Obsidian vault** (folder of markdown) + Syncthing → MacBook — see [[Obsidian vault management]]
- **Vector store** — deferred to Phase 3+ if semantic search becomes a recurring pain point. SQLite FTS5 is sufficient until then.
- **Redis** — ephemeral state, session cache — see [[redis]]

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

| Concern | Pick | Reference |
|---|---|---|
| Server | Hetzner CCX13, Ubuntu LTS | [[26060503-multi-tenant-server-layout]] |
| Ingress | Caddy | [[caddy]] |
| Edge | Cloudflare Tunnel + Access | — |
| Process supervision | systemd (infra), agents handle own loops | [[26060503-multi-tenant-server-layout]] |
| Database | SQLite + Litestream | [[SQlite]] |
| Vault sync | Syncthing | [[Obsidian vault management]] · [[ADR-26060501-vault-client-model]] |
| Cache / queue | Redis | [[redis]] |
| Secrets | sops + age | [[secrets]] |
| Observability | Sentry + Uptime Kuma | [[sentry-uptime-kuma]] |
| Backups | Litestream → R2 or Hetzner Storage Box; vault → git mirror | [[Obsidian vault management]] |
| Agents | Claude CLI, Gemini CLI, Opencode CLI | [[26060504-mvp-agent-strategy]] |

## Roadmap

| Phase             | Scope                                                                  | Status      | Anchor blueprint |
| ----------------- | ---------------------------------------------------------------------- | ----------- | ---------------- |
| **0 — MVP**       | Foundation + Auth + Cashflow page (local-first, cloud-ready)           | 🔲 Building | [[26060502-mvp-foundation-cashflow]] |
| **1 — Deploy + First Agent** | Hetzner deploy (Caddy / cloudflared / CF Access / Litestream) + Emily persona on Gemini/Claude/Opencode + `mcp-hud` cashflow tools | 🔲 Planned  | [[26060503-multi-tenant-server-layout]] · [[26060701-hud-agent-runtime-emily]] |
| **2 — Knowledge** | Research + Notes + Vault + Syncthing → MacBook (Obsidian); `vault.*` MCP namespace added to `mcp-hud`             | 🔲 Planned  | [[ADR-26060501-vault-client-model]] · [[ADR-26060602-build-vault-separation]] |
| **3 — Workflow**  | Kanban module, scheduled agent routines, additional MCP namespaces (`calendar.*`, `schedule.*`)    | 🔲 Planned  | [[26060504-mvp-agent-strategy]] · [[26060701-hud-agent-runtime-emily]] |
| **4 — Telegram + Web Chat**  | Telegram bridge (reuses Emily persona + `mcp-hud`) + dashboard chat panel + agent-api service                                | 🔲 Planned  | [[26060701-hud-agent-runtime-emily]] (Telegram boundary section) |
| **5 — Public**    | Portfolio guest agent (Nexus tab + portfolio-agent sandbox)            | 🔲 Planned  | [[26060503-multi-tenant-server-layout]] · [[ADR-26060501-vault-client-model]] |

## MVP — Foundation + Cashflow (Phase 0)

**Local-first build.** We stand up the full HUD stack on the laptop, then promote to Hetzner in Phase 1. Production posture (Caddy / cloudflared / CF Access / Litestream / sops) is configured and committed in MVP but not deployed until Phase 1.

**In scope:**
- Repo + monorepo scaffold (Next.js + Tailwind + shadcn/ui)
- Cyberpunk HUD design system (Orbitron / Oxanium, cyan accent `#0FB8C9`, hazard-stripe dividers, grid overlay) — see [[26060502-mvp-foundation-cashflow]]
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
- Vault + Syncthing → MacBook, monthly Obsidian reports (Phase 2)
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
- Build vault (`plan/`) is **tracked in git and coexists with the codebase** — excluded from Hetzner at deploy time only (rsync `--exclude=plan/`); never merged into the prod vault (`/srv/hud/vault/`). See [[ADR-26060602-build-vault-separation]] (D1 voided 2026-06-07; D2–D6 still apply)

---

# Index

> Hand-curated navigation. Add new docs to the right section as they land. Dataview blocks at the bottom auto-list anything that was missed.

## Active Board

- [[Kanban]] — live work-in-progress board (orchestrator-owned)
- `plan/tasks/` — ticket files, one per atomic work unit. Linked from Kanban cards.

## Blueprints — Active Phase Anchors

- [[26060502-mvp-foundation-cashflow]] — **Phase 0 anchor.** MVP scaffold + Cashflow page + design system.
- [[26060503-multi-tenant-server-layout]] — Phase 1 anchor (server layout). HUD + Portfolio tenancy, agent navigation, AppArmor hardening plan.
- [[26060701-hud-agent-runtime-emily]] — **Phase 1 partner anchor (agent runtime).** Emily persona on Gemini/Claude/Opencode + `packages/mcp-hud` cashflow MCP server. Telegram boundary documented for Phase 4.
- [[26060504-mvp-agent-strategy]] — Phase 3 precursor. Agent runtime, model routing, skill loading.
- [[26060601-dev-mode-perf-audit]] — Phase 0 supporting. Dev-mode perf quick wins (informs Ticket 09).

## Blueprints — Deferred / Superseded

- [[26060401-obsidian-iphone-sync]] — iPhone sync v1 (superseded by 26060402).
- [[26060402-obsidian-iphone-sync-webdav]] — iPhone WebDAV sync; **shelved** by [[ADR-26060501-vault-client-model]]. Reactivate if the deferral trigger fires.

## ADRs

- [[ADR-26060501-vault-client-model]] — MacBook first, Nexus last, iPhone deferred. Defines `/srv/hud/vault/` client model and the format-fidelity contract.
- [[ADR-26060602-build-vault-separation]] — ~~`plan/` gitignored (D1 voided 2026-06-07).~~ `plan/` stays tracked in git, excluded at deploy time only. `/srv/hud/vault/` is born blank in Phase 2 (D2). `obsidian-headless` rejected (D5). Single `main` branch through MVP (D4).

## Reference

- [[Obsidian vault management]] — vault sync architecture (Syncthing active; WebDAV deferred).
- [[SQlite]] — schema rules, migration policy, Litestream notes.
- [[Finance]] — money semantics (INTEGER minor units), category normalization.
- [[caddy]] — Caddyfile conventions, WebDAV module notes.
- [[redis]] — cache + queue patterns.
- [[secrets]] — sops + age workflow.
- [[sentry-uptime-kuma]] — observability stack.

## Skills (loaded on demand by agents)

**Build-time skills** (govern how the Builder agent writes code; live in `.claude/skills/`):

- `.claude/skills/obsidian-vault/SKILL.md` — vault edit invariants (Kanban format, frontmatter rules, wiki links, ticket template). Always loaded when editing anything under `plan/`.
- Other build-time skills land here as the build needs them (hud-money, hud-audit, hud-auth, …) — see [[26060504-mvp-agent-strategy]].

**Runtime skills** (govern how deployed agents behave; live in `apps/web/agents/<persona>/skills/`):

- `apps/web/agents/emily/skills/cashflow/SKILL.md` — when and how Emily uses the `cashflow.*` MCP tools. Added in Phase 1. See [[26060701-hud-agent-runtime-emily]].
- Additional runtime skills (`vault`, `calendar`, `schedule`) land per phase, each as a SKILL.md + a tool namespace in `packages/mcp-hud`.

## Visual Maps

- `HUD Architecture v2.canvas` — top-level system map (Obsidian Canvas; open in Obsidian).

## External (out of vault, but load-bearing)

- `~/CLAUDE.md` — Kevin's global Claude Code config + project map.
- `.claude/agents/architect.md` — architect agent definition (this voice).
- `.opencode/agent/orchestrator.md` — orchestrator agent (owns Kanban + tickets).
- `ops/` — production config artifacts checked in for Phase 1 (Caddyfile, cloudflared, sops, systemd units, litestream).

---

# Recently Updated (auto)

> Dataview rendered live in Obsidian. Will render as plain code in non-Obsidian viewers — that's fine.

```dataview
TABLE status, updated
FROM "plan/blueprints"
WHERE type = "blueprint" OR type = "adr"
SORT updated DESC
LIMIT 10
```

```dataview
TABLE status, priority, updated
FROM "plan/tasks"
WHERE status != "done"
SORT updated DESC
LIMIT 15
```

---

*Architecture designed June 2026. This index is the single entry point — keep it current whenever a new blueprint, ADR, or reference doc lands. See `HUD Architecture v2.canvas` for the visual map.*
