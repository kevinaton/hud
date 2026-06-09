---
id: Ticket 48
title: Write Token Rotation Runbook Update Canvas and Add Production Monitors
status: todo
priority: p2
area: infra
estimate: S
locus: hybrid
created: 2026-06-09
updated: 2026-06-09
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

## Acceptance Criteria

**Local:**
- [ ] `plan/reference/mcp-token-rotation.md` committed: step-by-step rotation procedure; a fresh reader can execute it in a dry-run without prior context; adding MacBook #2 in the future is demonstrated as a YAML-edit + token + Tailscale-join (no code changes)
- [ ] `plan/HUD Architecture v2.canvas` Layer 2 updated: HUD-internal agents sub-zone (solid border) + External platforms sub-zone (dashed border with Hermes/Andrea); tailnet edge from devices Layer 0 to Hetzner Layer 1 endpoint

**Server:**
- [ ] Uptime Kuma monitor: Hermes dashboard port `9119` — HTTP probe, 5-minute interval, alert configured
- [ ] Uptime Kuma monitor: Hermes gateway port `8642` — HTTP probe, 5-minute interval, alert configured
- [ ] Uptime Kuma monitor: MCP daemon tailnet `:7610` — TCP probe, 5-minute interval, alert configured
- [ ] Uptime Kuma monitor: Hermes container health endpoint — HTTP probe, 5-minute interval, alert configured
- [ ] All four monitors green after setup

## Sub-tasks

**Local:**
- [ ] Write `plan/reference/mcp-token-rotation.md` with full rotation procedure and MacBook-#2 onboarding dry-run
- [ ] Open `plan/HUD Architecture v2.canvas` in Obsidian Canvas; edit Layer 2 per blueprint §9 description; save

**Server:**
- [ ] Add four Uptime Kuma monitors with correct probe types and alert routing (Telegram or email per existing pattern)
- [ ] Verify all four monitors green

## Open Questions

## Notes
