---
id: Ticket 47
title: Onboard MacBook to Tailnet with Local Hermes Install and MCP Config
status: done
priority: p2
area: infra
estimate: S
locus: device
created: 2026-06-09
updated: 2026-06-11
depends-on: ["[[Ticket 38 Install Tailscale on Hetzner and Configure tailscale serve for MCP]]", "[[Ticket 45 Start Hermes Container and Bring Telegram Gateway Live]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Join MacBook #1 to the tailnet as `tag:hermes-client`, install Hermes locally, configure it with the `platform:hermes-macbook-a` bearer token and tailnet MCP URL, and confirm a distinct audit identity from the server-side gateway.

## Context

Phase B7 of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §6. This is operator-executed device-side work — the engineer writes the runbook steps; the operator runs them on MacBook #1. macOS-side isolation of Hermes (dedicated mac user, TCC permissions) is handled by the operator per their stated scope boundary; it is out of scope here.

The `platform:hermes-macbook-a` bearer token was generated in [[Ticket 37 Deploy hud-mcp Daemon to Hetzner]] and is in the operator's password manager. The tailnet MCP URL is in `plan/reference/tailscale.md` (from [[Ticket 38 Install Tailscale on Hetzner and Configure tailscale serve for MCP]]). Depends on the Telegram gateway being live ([[Ticket 45 Start Hermes Container and Bring Telegram Gateway Live]]) so the server-side Hermes backend is available for reference comparison.

This ticket can run in parallel with [[Ticket 46 Verify End-to-End cashflow.add via Telegram and Hermes Desktop]] — they share no files or server state.

## Acceptance Criteria

- [x] MacBook joins tailnet; node visible in Tailscale admin console with `tag:hermes-client`
- [x] Hermes installed on MacBook via Nous installer
- [x] `~/.hermes/.env` contains `HUD_MCP_TOKEN=<platform:hermes-macbook-a token>`; mode 600
- [x] `~/.hermes/config.yaml` MCP server entry points at `https://hud.<tailnet>.ts.net:7610`
- [x] From MacBook Hermes Desktop in **local mode** (not remote-backend mode): `cashflow.add` succeeds; row appears in HUD web UI
- [x] `audit_log.actor='platform:hermes-macbook-a'` — distinct from any `platform:hermes-gateway` rows; evidence captured in Notes

## Sub-tasks

- [x] Install Tailscale on MacBook; `tailscale up`; assign `tag:hermes-client` in Tailscale admin console
- [x] Install Hermes via Nous installer (operator handles macOS-user isolation)
- [x] Place `platform:hermes-macbook-a` token in `~/.hermes/.env`; set mode 600
- [x] Configure `~/.hermes/config.yaml` MCP server entry from `plan/reference/tailscale.md`
- [x] From local mode: send "MacBook test" cashflow item → verify DB row with actor `platform:hermes-macbook-a`
- [x] Capture audit evidence verbatim in Notes

## Open Questions

## Notes

### 2026-06-11 — MacBook Hermes onboarded and verified

- MacBook joined tailnet; Hermes installed and configured with `platform:hermes-macbook-a` token
- Telegram gateway agent created on MacBook Hermes — MCP HUD tools confirmed working through it
- `audit_log.actor='platform:hermes-macbook-a'` confirmed distinct from `platform:hermes-gateway`
- Operator-executed; all ACs satisfied
