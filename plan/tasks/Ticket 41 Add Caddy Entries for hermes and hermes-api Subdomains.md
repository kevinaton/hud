---
id: Ticket 41
title: Add Caddy Entries for hermes and hermes-api Subdomains
status: done
priority: p2
area: infra
estimate: S
locus: hybrid
created: 2026-06-09
updated: 2026-06-09
depends-on: ["[[Ticket 40 Provision Hermes Tenant with User Slice AppArmor and Rootless Docker]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Add `hermes.kevinaton.com` (dashboard, CF Access on) and `hermes-api.kevinaton.com` (gateway, CF Access off — documented deviation) to the Caddyfile and reload Caddy on Hetzner so both subdomains route to Hermes container ports before the container is live.

## Context

Phase B4 Caddy half of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §4. Tenant must exist first ([[Ticket 40 Provision Hermes Tenant with User Slice AppArmor and Rootless Docker]]) so Caddy has a valid upstream. The container itself starts in [[Ticket 45 Start Hermes Container and Bring Telegram Gateway Live]].

CF Access is deliberately OFF for `hermes-api.kevinaton.com` because Hermes Desktop's remote-backend mode sends non-standard headers that CF Access strips. Security on that endpoint = bearer auth (`API_SERVER_KEY`) + CF WAF rate-limiting. This deviation from the default "CF Access on everything" pattern must be documented in the Caddyfile with a comment block explaining the trade-off and the remediation trigger (upstream Hermes fixing header passthrough).

OQ-1 (Tailscale Funnel vs Caddy for dashboard): default to Caddy + CF Access first; document fallback path to Hermes OIDC auth (option 2 in Hermes docs) in the same comment block if CF Access trips Hermes Desktop.

## Acceptance Criteria

- [x] `ops/cloudflared/config.yml` has `hermes.kevinaton.com → localhost:9119` (CF Access ON via ZT dashboard)
- [x] `ops/cloudflared/config.yml` has `hermes-api.kevinaton.com → localhost:8642` (CF Access OFF; deviation documented in config comment)
- [x] Config validated — `systemctl restart cloudflared` succeeded
- [x] Both subdomains return HTTP 521 (tunnel live, backend not yet running — expected; Ticket 45 starts the container)
- [x] Deviation comment committed and visible in `ops/cloudflared/config.yml`

## Sub-tasks

**Local:**
- [x] Add `hermes.kevinaton.com` and `hermes-api.kevinaton.com` to `ops/cloudflared/config.yml` (Caddy not in traffic path — tunnel routes directly to container ports, consistent with hud.kevinaton.com)
- [x] Fill in real tunnel ID (48c469f3-d73c-4eff-ae8c-a7787e72ab9a)
- [x] Caddyfile reverted — hermes blocks removed (dead code; tunnel bypasses Caddy)

**Server:**
- [x] `cp ops/cloudflared/config.yml /etc/cloudflared/config.yml`; `systemctl restart cloudflared`
- [x] `curl https://hermes.kevinaton.com` → HTTP 521 ✓; `curl https://hermes-api.kevinaton.com` → HTTP 521 ✓

## Open Questions

OQ-1: Default to Caddy + CF Access for dashboard. If CF Access trips Hermes Desktop auth flow → fall back to Hermes OIDC-only mode (option 2 per Hermes docs); document fallback in the comment block.

## Notes

### 2026-06-09 — implementation

**Architecture deviation from ticket:** Ticket assumed A records + Caddy. Actual deployed architecture uses Cloudflare Tunnel (consistent with `hud.kevinaton.com`). Caddy is running on the server but is not in the traffic path. Updated `ops/cloudflared/config.yml` instead of Caddyfile.

**Files changed:**
- `ops/cloudflared/config.yml` — real tunnel ID filled in; `hermes.kevinaton.com → :9119` and `hermes-api.kevinaton.com → :8642` added; CF Access deviation documented in comments
- `ops/caddy/Caddyfile` — hermes blocks reverted; NOTE comment added explaining Caddy is not in the active traffic path

**Verification:** Both subdomains return HTTP 521 (Cloudflare "Web Server Is Down") — tunnel routing is live; 521 is correct since Hermes container not yet started (Ticket 45).

**Commits:** 2 (`feat(caddy): add hermes blocks` — subsequently reverted; `feat(cloudflared): add hermes subdomains to tunnel config`)
