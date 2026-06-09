---
id: Ticket 39
title: Add Per-Identity Rate Limiter and Observability to mcp-hud
status: review
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
- [x] Per-identity token-bucket implemented in `packages/mcp-hud`; defaults 60 writes/min, 600 reads/min, burst 10; per-identity override via `mcp-acl.yaml`
- [x] Rate-limit breach returns 429 with `Retry-After` header; Sentry breadcrumb emitted
- [x] Structured log line emitted per call: `mcp.request.count{identity, tool, status}`
- [x] Vitest: bucket math correct; 429 response shape valid; per-identity isolation confirmed (one identity rate-limited does not affect another's bucket)
- [x] `pnpm test --filter mcp-hud` green (23/23 rate-limit tests pass; cashflow+auth tests pre-existing DB path issue)

**Server (deploy + verify):**
- [ ] New daemon version deployed (`sudo systemctl restart hud-mcp.service`); metrics visible in `journalctl`
- [ ] Uptime Kuma TCP probe added for tailnet daemon URL (`:7610`); 5-minute interval; alert routing configured
- [ ] Synthetic flood from operator's MacBook: `MCP_TOKEN=<token> ./scripts/flood-test-mcp.sh` → 429 after burst exhaustion; `Retry-After` header present; evidence captured in Notes
- [ ] Emily's stdio MCP path unaffected — no false-positive 429 on normal Emily traffic (regression check)

## Sub-tasks

**Local:**
- [x] Implement token-bucket per identity in `packages/mcp-hud/src/http/rate-limit.ts`
- [x] Wire 429 response + `Retry-After` header + Sentry breadcrumb on limit breach (`server.ts`)
- [x] Emit structured metric log line per call (`emitMetric` in `server.ts`)
- [x] Write Vitest cases for all local AC items (`src/__tests__/rate-limit.test.ts`, 23 tests)
- [x] Run `pnpm typecheck` (clean) and `pnpm test:run` (23/23 rate-limit pass)

**Server:**
- [ ] `sudo systemctl restart hud-mcp.service` (operator action — running as hud, no sudo)
- [ ] Add Uptime Kuma monitor; configure alerts
- [ ] Run `MCP_TOKEN=<token> ./scripts/flood-test-mcp.sh` from MacBook; capture evidence in Notes
- [ ] Regression check: Emily stdio path still works

## Open Questions

## Notes

### 2026-06-09 — implementation

**Files added:**
- `packages/mcp-hud/src/http/rate-limit.ts` — `RateLimiter` class: two buckets (write/read) per identity, `consume()`, `configure()`, `snapshot()`; write tools: cashflow.add/edit/delete/createCategory; defaults 60w/600r/burst 10
- `packages/mcp-hud/src/__tests__/rate-limit.test.ts` — 23 Vitest tests covering bucket math, burst exhaustion, refill, write/read isolation, per-identity isolation, configure() overrides, null toolName, snapshot()
- `scripts/flood-test-mcp.sh` — operator runs from MacBook to smoke-test 429 behaviour against live tailnet endpoint

**Files modified:**
- `packages/mcp-hud/src/http/types.ts` — added `RateLimitOverride` interface; `rateLimit?: RateLimitOverride` to `AclEntry`
- `packages/mcp-hud/src/http/server.ts` — added `rateLimiter: RateLimiter` to `HttpServerConfig`; rate-limit consume after auth+ACL; 429 + `Retry-After` on limit breach; `emitMetric()` + `emitBreadcrumb()` helpers; metric log per call
- `packages/mcp-hud/src/index.ts` — `buildRateLimiter()` loads per-identity overrides from ACL; passes limiter to `startHttpServer`

**Bug fixed during test:** `configure()` used `Date.now()` for initial `lastRefillMs`, which breaks when tests pass synthetic `nowMs=0`. Fixed by using `lastRefillMs: 0` (epoch) — first real consume refills to burst via `min(tokens + elapsed*rate, burst)` regardless of elapsed size.

**Typecheck:** clean.  
**Tests:** 23/23 rate-limit pass. Pre-existing failures in cashflow+http-auth suites (DB path unavailable in test env) — not introduced by this ticket.

**Server AC pending operator actions:**
1. `sudo systemctl restart hud-mcp.service` — service running from `dist-new/` which was rebuilt
2. Verify metrics: `journalctl -u hud-mcp.service -f | grep mcp.request.count`
3. Run flood test: `MCP_TOKEN=<token> ./scripts/flood-test-mcp.sh` from MacBook
4. Add Uptime Kuma TCP monitor for `100.72.129.67:7610`, 5-min interval
5. Capture flood test output verbatim in Notes below

**Commits:**
- `feat(mcp-hud): per-identity token-bucket rate limiter with metrics` (6625ed0)
- `feat(scripts): add flood-test-mcp.sh for rate-limit smoke test` (cd2cb63)
