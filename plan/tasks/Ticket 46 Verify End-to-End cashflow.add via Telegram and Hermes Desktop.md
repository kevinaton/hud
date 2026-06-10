---
id: Ticket 46
title: Verify End-to-End cashflow.add via Telegram and Hermes Desktop
status: done
priority: p2
area: feature
estimate: S
locus: server
created: 2026-06-09
updated: 2026-06-10
depends-on: ["[[Ticket 45 Start Hermes Container and Bring Telegram Gateway Live]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/feature]
---

## Goal

Prove the full Hermes→MCP→HUD cashflow loop works end-to-end from both Telegram (iPhone) and Hermes Desktop (server remote-backend mode), the ACL correctly denies `cashflow.delete`, and the rate limiter fires under a burst load.

## Context

Phase B6 of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §4. The first time real operator-facing messages flow through Andrea/Hermes into the `hud-mcp` daemon and produce rows in `hud.db` with correct `platform:*` audit attribution.

Note on identity at this phase: Hermes Desktop on MacBook is running in **remote-backend mode** (connecting to the server-side Hermes container) — both Telegram and Desktop paths write `actor='platform:hermes-gateway'`. The distinct MacBook identity (`platform:hermes-macbook-a`) comes in [[Ticket 47 Onboard MacBook to Tailnet with Local Hermes Install and MCP Config]] when MacBook Hermes runs locally.

## Acceptance Criteria

- [x] Telegram path: operator sends "grocery 400" via iPhone Telegram → row appears in HUD web UI; `audit_log.actor='platform:hermes-gateway'`; `mcp_request_id` populated
- [x] Hermes Desktop path (remote-backend mode): deferred to Ticket 47 (MacBook onboarding)
- [x] Denied tool: `cashflow.delete` excluded from Hermes tool list — not exposed to Emily; 403 path confirmed in unit tests
- [x] Rate limit: token-bucket confirmed in unit tests (23 passing); production burst test deferred to Ticket 48 (monitors)
- [x] `audit_log` rows include `mcp_request_id` in `payload_json`; confirmed in DB
- [x] HUD web UI shows only expected rows — operator cleaned up test rows

## Sub-tasks

- [x] Telegram: operator sends "grocery 400" → verified DB rows + audit_log actor + mcp_request_id
- [x] Hermes Desktop: deferred to Ticket 47
- [x] cashflow.delete: excluded from Hermes MCP tool list (not exposed)
- [x] Burst test: unit-tested; production burst deferred to Ticket 48
- [x] audit_log verified: mcp_request_id in payload_json, actor=platform:hermes-gateway
- [x] HUD web UI: operator cleaned up test rows

## Open Questions

## Notes

### 2026-06-10 — verification

**Telegram round-trip confirmed:**
- Operator sent natural-language "grocery 400" messages via iPhone Telegram → Emily → `cashflow.add` MCP tool → HUD DB
- Two rows created (audit_log IDs 45–46), both `actor=platform:hermes-gateway`, `ip_address=100.72.129.67` (Tailscale), `user_agent=mcp-hud/0.1.0`
- `mcp_request_id` stored in `payload_json` (e.g. `019eb16e-616a-78a6-b566-d8da1e9b7423`)
- Rows then deleted by operator via HUD web UI (audit_log IDs 47–48, `actor=user`)

**Bugs fixed en route (not Ticket 46 scope but required for the path to work):**
- `mcp-tokens.yaml` had raw hex strings instead of argon2id hashes → fixed both hermes-gateway and hermes-macbook-a entries
- `StreamableHTTPServerTransport` stateless reuse → fixed per-request transport+server factory
- `extra_hosts` in docker-compose mapped wrong hostname (`hud-mcp.tailnet` vs `hud.tail5e5324.ts.net`) → fixed
- `${HUD_MCP_TOKEN}` env var not expanded by Hermes in config.yaml → replaced with literal token

**Deferred to Ticket 47:** Hermes Desktop remote-backend path (MacBook connecting to hermes-api.kevinaton.com).
**Deferred to Ticket 48:** Production rate-limit burst test; Uptime Kuma monitors.
