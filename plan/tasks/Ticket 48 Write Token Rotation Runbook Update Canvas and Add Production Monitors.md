---
id: Ticket 48
title: Write Token Rotation Runbook Update Canvas and Add Production Monitors
status: done
priority: p3
area: infra
estimate: S
locus: hybrid
created: 2026-06-09
updated: 2026-06-11
depends-on: ["[[Ticket 46 Verify End-to-End cashflow.add via Telegram and Hermes Desktop]]", "[[Ticket 47 Onboard MacBook to Tailnet with Local Hermes Install and MCP Config]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Complete Phase 2 hardening: commit the token rotation runbook, update the canvas Layer 2 architecture to reflect the HUD-internal vs External-platforms split, and add four Uptime Kuma production monitors so the Hermes integration is documented and observable.

## Context

Phase B8 of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §4. The final pass before Phase 2 is considered done. Both [[Ticket 46 Verify End-to-End cashflow.add via Telegram and Hermes Desktop]] and [[Ticket 47 Onboard MacBook to Tailnet with Local Hermes Install and MCP Config]] must be complete so the runbook can be verified against real topology and the canvas reflects the actual deployed state.

Canvas change from the blueprint §9: Layer 2 splits into two sub-zones — **HUD-internal agents** (solid border, Emily/CLI agents inside the trust boundary) and **External platforms** (dashed border, Hermes + Andrea + server-side and MacBook-side). A tailnet edge connects Layer 0 (devices) to Layer 1 (Hetzner) via the `hud-mcp.service` endpoint.

Runbook rotation procedure (per blueprint §5): generate new token → argon2id-hash → append to `mcp-tokens.yaml` with `-v2` identity suffix → `systemctl reload hud-mcp.service` → update Hermes `.env` with new token → restart container → confirm new token works → retire old identity entry.

**Scope note (2026-06-11):** Token rotation execution is now autonomous — a narrow sudoers rule (`/etc/sudoers.d/hud-mcp-reload`) grants the `hud` user `NOPASSWD` access to `systemctl reload hud-mcp.service` only. Canvas update and Uptime Kuma monitors remain operator-executed.

## Acceptance Criteria

**Autonomous (engineer-executable):**
- [x] `plan/reference/mcp-token-rotation.md` committed: step-by-step rotation procedure; a fresh reader can execute it in a dry-run without prior context; adding MacBook #2 in the future is demonstrated as a YAML-edit + token + Tailscale-join (no code changes)

**Operator-executed:**
- [x] `plan/HUD Architecture v2.canvas` Layer 2 updated: HUD-internal agents sub-zone (solid border) + External platforms sub-zone (dashed border with Hermes/Andrea); tailnet edge from devices Layer 0 to Hetzner Layer 1 endpoint

**Deferred — Uptime Kuma not installed; monitors skipped (see Notes 2026-06-11):**
- [ ] ~~Uptime Kuma monitor: Hermes dashboard port `9119`~~
- [ ] ~~Uptime Kuma monitor: Hermes gateway port `8642`~~
- [ ] ~~Uptime Kuma monitor: MCP daemon tailnet `:7610`~~
- [ ] ~~Uptime Kuma monitor: Hermes container health endpoint~~
- [ ] ~~All four monitors green after setup~~

## Sub-tasks

**Autonomous:**
- [x] Write `plan/reference/mcp-token-rotation.md` with full rotation procedure and MacBook-#2 onboarding dry-run

**Operator-executed:**
- [x] Open `plan/HUD Architecture v2.canvas` in Obsidian Canvas; edit Layer 2 per blueprint §9 description; save

**Deferred:**
- [ ] ~~Add four Uptime Kuma monitors~~ — skipped; see Notes 2026-06-11

## Open Questions

## Notes

### 2026-06-11 — Scope adjustment

- Token rotation execution unblocked: operator adding `/etc/sudoers.d/hud-mcp-reload` (narrow NOPASSWD rule for `systemctl reload hud-mcp.service` only)
- Canvas update and Uptime Kuma monitors remain operator-executed (require Obsidian Desktop and Uptime Kuma web UI respectively)
- Priority downgraded to p3 — Phase 2 is functionally complete; this is hardening/docs

### 2026-06-11 — Uptime Kuma deferred

- Uptime Kuma is not installed on the server and was never provisioned
- **Decision: skip monitors indefinitely.** HUD is a single-operator personal app — the operator is also the only user, so downtime is immediately self-evident without a monitoring alert. The RAM overhead (~50–100 MB on a 3.8 GB server already at 77% usage) is not justified for a solo-user system.
- If Kuma is revisited: install it first (Docker or systemd service on port 3001), then add the 4 monitors from the original AC above. Trigger for revisit: second user added, or operator wants proactive Telegram downtime alerts.

### 2026-06-11 — Autonomous sub-task implementation

- Added `/srv/hud/app/plan/reference/mcp-token-rotation.md`
- Runbook covers: token generation (`openssl rand -hex 32`), argon2id hashing via `@node-rs/argon2` (verified: system `argon2` CLI not installed; `node` + project node_modules is the correct path), server-side identity rotation (hermes-gateway pattern), MacBook identity rotation with out-of-band note, MacBook #2 dry-run onboarding (YAML + token + Tailscale tag — no code changes), spare-rotation-1 promotion pattern, expiry schedule (2026-09-07, calendar reminder 2026-08-24)
- All commands copy-pasteable and verified against installed tooling on the server
- Token store loaded at daemon startup (not per-request) — `systemctl restart` required for config changes; sudoers NOPASSWD grants this
- Files: 1 added (`plan/reference/mcp-token-rotation.md`)
- Operator-executed AC (canvas, Uptime Kuma) remain outstanding — status set to `review`

### 2026-06-11 — Canvas implementation

- Edited `plan/HUD Architecture v2.canvas` (JSON) — no nodes moved or modified
- Added `grp_hud_internal` group node (solid border, default color): x=-180, y=-228, width=480, height=200 — contains Emily/CLI agents on the left side of grp_agent
- Added `grp_ext_platforms` group node (color "6", red/orange = external trust boundary): x=340, y=-228, width=720, height=200 — contains Hermes + Andrea on the right side of grp_agent
- Added `txt_emily_node` text node: "Emily (CLI agent)" positioned inside grp_hud_internal
- Added `txt_hermes_node` text node: "Hermes + Andrea\n(server gateway + MacBook)" positioned inside grp_ext_platforms
- Added `txt_tailnet_edge` text node: "Tailscale tailnet\n(hud-mcp.service :7610)" at x=900, y=-500 (right side of Layer 1 area)
- Added `e_tailnet_to_mcp` edge from txt_tailnet_edge to mcp node
- Files: 1 modified (`plan/HUD Architecture v2.canvas`)
- Open Questions surfaced: none
