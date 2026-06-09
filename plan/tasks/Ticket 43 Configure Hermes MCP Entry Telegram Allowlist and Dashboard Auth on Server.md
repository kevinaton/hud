---
id: Ticket 43
title: Configure Hermes MCP Entry Telegram Allowlist and Dashboard Auth on Server
status: done
priority: p2
area: infra
estimate: S
locus: server
created: 2026-06-09
updated: 2026-06-09
depends-on: ["[[Ticket 38 Install Tailscale on Hetzner and Configure tailscale serve for MCP]]", "[[Ticket 40 Provision Hermes Tenant with User Slice AppArmor and Rootless Docker]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Populate `/srv/hermes/data/config.yaml` and `/srv/hermes/data/.env` with real credentials — the HUD MCP tailnet URL, bearer token, Telegram bot token, allowlisted Telegram user ID, model API keys, and dashboard auth — so the container can connect to HUD and accept Telegram messages from the operator on first start.

## Context

Phase B5 server/config half of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §4 + §5. Server-only work — config contains real secrets, never committed to git. The tailnet URL comes from [[Ticket 38 Install Tailscale on Hetzner and Configure tailscale serve for MCP]] (`plan/reference/tailscale.md`). The data directory comes from [[Ticket 40 Provision Hermes Tenant with User Slice AppArmor and Rootless Docker]]. The `platform:hermes-gateway` bearer token was generated in [[Ticket 37 Deploy hud-mcp Daemon to Hetzner]] and is in the operator's password manager.

OQ-3 (Telegram allowlist): single operator `telegram_user_id` only — no groups, no chats.
OQ-4 (token rotation cadence): 90 days; documented in `.env` comment.
OQ-5 (notes field redaction): no redaction at MVP — operator owns the disclosure.
Dashboard auth: basic-auth + CF Access first; OIDC fallback path documented per OQ-1.

## Acceptance Criteria

- [x] `/srv/hermes/data/config.yaml` exists (mode 0640, owner agent-hermes); `mcp_servers.hud.url: https://hud.tail5e5324.ts.net/mcp`; `Authorization: Bearer ${HUD_MCP_TOKEN}`; edit/delete/createCategory excluded
- [x] `/srv/hermes/data/.env` exists (mode 0600, owner agent-hermes); keys: `OPENCODE_ZEN_API_KEY`, `HUD_MCP_TOKEN`, `API_SERVER_KEY`, `TELEGRAM_BOT_TOKEN`
- [x] Secrets in `.env` only — not in config.yaml (env var references used); no plaintext in config file
- [x] OQ-3: `allowed_user_ids: [8369197480]` — operator only; no groups or chats
- [x] OQ-4: 90-day rotation cadence comment in `.env`; next rotation 2026-09-09
- [ ] Dry-run parse check — deferred to Ticket 45 (container start)

## Sub-tasks

- [x] MCP URL from `plan/reference/tailscale.md`: `https://hud.tail5e5324.ts.net/mcp`
- [x] `/srv/hermes/data/config.yaml` written with MCP server, Telegram config, memory, security
- [x] `/srv/hermes/data/.env` populated with all required credentials
- [x] Modes and ownership set: `.env` 600, `config.yaml` 640, both `agent-hermes:agent-hermes`
- [x] Secrets in env vars only — not exposed in config.yaml or command line
- [ ] Dry-run parse check deferred to Ticket 45

## Open Questions

OQ-3: Resolved — operator's `telegram_user_id` only; documented in `.env` comment.
OQ-4: Resolved — 90-day rotation cadence; documented in `.env` comment.
OQ-5: No notes-field redaction at MVP.

## Notes

### 2026-06-09 — implementation

**Files created on server (not in git):**
- `/srv/hermes/data/.env` — mode 0600, agent-hermes; keys: OPENCODE_ZEN_API_KEY, HUD_MCP_TOKEN, API_SERVER_KEY, TELEGRAM_BOT_TOKEN; 90-day rotation comment
- `/srv/hermes/data/config.yaml` — mode 0640, agent-hermes; provider: opencode-zen (no model pinned — Hermes uses provider default); MCP hud entry with tailnet URL + Bearer auth; Telegram allowed_user_ids: [8369197480]

**Model provider:** OpenCode Zen (`provider: opencode-zen`, `OPENCODE_ZEN_API_KEY`). Model name not pinned — provider default used. Operator can run `hermes model` inside container to switch.

**Dashboard auth:** Not separately configured — CF Access handles auth for `hermes.kevinaton.com`. Hermes dashboard basic-auth not set at MVP (CF Access is the gate). Revisit if CF Access trips Hermes Desktop auth flow (OQ-1 fallback path).

**Dry-run config parse check:** Deferred to Ticket 45 — will be confirmed on first `docker compose up -d`.
