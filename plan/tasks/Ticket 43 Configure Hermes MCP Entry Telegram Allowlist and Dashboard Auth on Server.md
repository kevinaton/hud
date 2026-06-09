---
id: Ticket 43
title: Configure Hermes MCP Entry Telegram Allowlist and Dashboard Auth on Server
status: todo
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

- [ ] `/srv/hermes/data/config.yaml` exists with `mcp_servers.hud.url` pointing at the tailnet MCP URL and `Authorization` header referencing `${HUD_MCP_TOKEN}` from env
- [ ] `/srv/hermes/data/.env` exists with all required keys: `HUD_MCP_TOKEN`, Telegram bot token, allowlisted `telegram_user_id`, model API keys, dashboard auth env vars; mode 600, owner `agent-hermes`
- [ ] No plaintext token visible in `ps aux`, `journalctl`, or `docker inspect` output
- [ ] OQ-3 resolved: only the operator's Telegram user ID is allowlisted; documented in `.env` comment
- [ ] OQ-4 resolved: 90-day rotation cadence documented in `.env` comment
- [ ] Hermes container reads config on first dry-run start with no parse errors (`docker compose up --no-start` or equivalent config-check command)

## Sub-tasks

- [ ] Read `plan/reference/tailscale.md` for the tailnet MCP URL
- [ ] Write `/srv/hermes/data/config.yaml` with MCP server entry and Telegram gateway config
- [ ] Populate `/srv/hermes/data/.env` with all required credentials; add rotation-cadence and Telegram-allowlist comments
- [ ] Set mode 600 and owner `agent-hermes` on both files
- [ ] Verify no secrets leak into `ps aux` or `docker inspect`
- [ ] Dry-run: `docker compose up --no-start`; confirm config parses cleanly (no parse errors in output)

## Open Questions

OQ-3: Resolved — operator's `telegram_user_id` only; documented in `.env` comment.
OQ-4: Resolved — 90-day rotation cadence; documented in `.env` comment.
OQ-5: No notes-field redaction at MVP.

## Notes
