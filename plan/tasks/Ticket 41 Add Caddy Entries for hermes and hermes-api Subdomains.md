---
id: Ticket 41
title: Add Caddy Entries for hermes and hermes-api Subdomains
status: todo
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

- [ ] `ops/caddy/Caddyfile` has a `hermes.kevinaton.com` block proxying to `127.0.0.1:9119` with CF Access enabled (consistent with the existing HUD site pattern)
- [ ] `ops/caddy/Caddyfile` has a `hermes-api.kevinaton.com` block proxying to `127.0.0.1:8642` with CF Access explicitly off; a comment block explains the deviation, security compensating controls, and remediation trigger
- [ ] `caddy validate` passes locally
- [ ] Server: `git pull`; `caddy validate`; `systemctl reload caddy`; both subdomains return a Caddy-routed response (502/503 acceptable if Hermes is not yet running; DNS error is not acceptable)
- [ ] Deviation comment block is committed and visible in code review

## Sub-tasks

**Local:**
- [ ] Add `hermes.kevinaton.com` server block to `ops/caddy/Caddyfile`
- [ ] Add `hermes-api.kevinaton.com` server block with CF Access off and deviation comment block
- [ ] Run `caddy validate` locally; confirm clean

**Server:**
- [ ] `git pull`; `caddy validate`; `systemctl reload caddy`
- [ ] Verify both subdomains return a Caddy-routed response (curl or browser check)

## Open Questions

OQ-1: Default to Caddy + CF Access for dashboard. If CF Access trips Hermes Desktop auth flow → fall back to Hermes OIDC-only mode (option 2 per Hermes docs); document fallback in the comment block.

## Notes
