---
id: Ticket 46
title: Verify End-to-End cashflow.add via Telegram and Hermes Desktop
status: todo
priority: p2
area: feature
estimate: S
locus: server
created: 2026-06-09
updated: 2026-06-09
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

- [ ] Telegram path: operator sends "grocery 400" via iPhone Telegram → row appears in HUD web UI; `audit_log.actor='platform:hermes-gateway'`; `mcp_request_id` populated
- [ ] Hermes Desktop path (remote-backend mode): same input → same result with same actor; distinct row in DB
- [ ] Denied tool: `cashflow.delete` attempted via Hermes → daemon returns 403 with `tool_not_allowed_for_identity`; Hermes surfaces the error to the operator without retry; evidence captured in Notes
- [ ] Rate limit: burst of 20 `cashflow.add` calls in 5s → 429 response after bucket exhaustion; `Retry-After` header present; evidence captured in Notes
- [ ] `audit_log` rows include `mcp_request_id`; cross-correlation attempt with Hermes session DB documented (result or known gap) in Notes
- [ ] HUD web UI shows only the expected rows — no phantom rows from test runs

## Sub-tasks

- [ ] Telegram: operator sends "grocery 400" → verify DB row + `audit_log` actor + `mcp_request_id`
- [ ] Hermes Desktop: operator sends same input via remote-backend mode → verify DB row + audit log
- [ ] Attempt `cashflow.delete` via Hermes; capture 403 response verbatim in Notes; confirm Hermes error UX
- [ ] Run burst test (20 calls in 5s); capture 429 evidence verbatim in Notes
- [ ] Query `audit_log` for all test rows; verify `mcp_request_id` populated; attempt cross-correlation with Hermes session DB
- [ ] Review HUD web UI for unexpected rows; clean up test data via Emily if needed

## Open Questions

## Notes
