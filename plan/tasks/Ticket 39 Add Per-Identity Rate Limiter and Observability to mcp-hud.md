---
id: Ticket 39
title: Add Per-Identity Rate Limiter and Observability to mcp-hud
status: todo
priority: p2
area: feature
estimate: S
locus: hybrid
created: 2026-06-09
updated: 2026-06-09
depends-on: ["[[Ticket 38 Install Tailscale on Hetzner and Configure tailscale serve for MCP]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/feature]
---

## Goal

Add per-identity token-bucket rate limiting (60 writes/min, 600 reads/min) to `packages/mcp-hud`, wire Sentry breadcrumbs on 4xx/5xx responses, and verify the limit holds under a synthetic flood test against the live tailnet endpoint.

## Context

Phase B3 of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §2 security model (DoS + prompt-injection blast-radius control). Rate limits are per-identity — one identity hitting its limit does not affect others. Caps prompt-injection blast radius: a fully compromised Hermes can add at most 60 cashflow rows/minute; every row is audited and recoverable.

Depends on [[Ticket 38 Install Tailscale on Hetzner and Configure tailscale serve for MCP]] being live so the server-side AC (synthetic flood test against the real tailnet URL) can be verified.

Defaults: 60 writes/min, 600 reads/min, burst 10. Overridable per-identity in `mcp-acl.yaml`.

## Acceptance Criteria

**Local (code):**
- [ ] Per-identity token-bucket implemented in `packages/mcp-hud`; defaults 60 writes/min, 600 reads/min, burst 10; per-identity override via `mcp-acl.yaml`
- [ ] Rate-limit breach returns 429 with `Retry-After` header; Sentry breadcrumb emitted
- [ ] Structured log line emitted per call: `mcp.request.count{identity, tool, status}`
- [ ] Vitest: bucket math correct; 429 response shape valid; per-identity isolation confirmed (one identity rate-limited does not affect another's bucket)
- [ ] `pnpm test --filter mcp-hud` green

**Server (deploy + verify):**
- [ ] New daemon version deployed (`git pull`; `pnpm build`; `systemctl restart hud-mcp.service`); metrics visible in `journalctl`
- [ ] Uptime Kuma TCP probe added for tailnet daemon URL (`:7610`); 5-minute interval; alert routing configured
- [ ] Synthetic flood from operator's MacBook (100 rapid `cashflow.list` calls within 10s) produces 429 after bucket exhaustion; `Retry-After` header present; evidence captured in Notes
- [ ] Emily's stdio MCP path unaffected — no false-positive 429 on normal Emily traffic (regression check)

## Sub-tasks

**Local:**
- [ ] Implement token-bucket per identity in `packages/mcp-hud/src/`
- [ ] Wire 429 response + `Retry-After` header + Sentry breadcrumb on limit breach
- [ ] Emit structured metric log line per call
- [ ] Write Vitest cases for all local AC items
- [ ] Run `pnpm test` and `pnpm typecheck`

**Server:**
- [ ] `git pull`; `pnpm build --filter mcp-hud`; `systemctl restart hud-mcp.service`
- [ ] Add Uptime Kuma monitor; configure alerts
- [ ] Run synthetic flood test; capture evidence verbatim in Notes
- [ ] Regression check: Emily stdio path still works

## Open Questions

## Notes
