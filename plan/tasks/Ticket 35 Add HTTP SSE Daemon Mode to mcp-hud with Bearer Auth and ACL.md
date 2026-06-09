---
id: Ticket 35
title: Add HTTP SSE Daemon Mode to mcp-hud with Bearer Auth and ACL
status: done
priority: p2
area: feature
estimate: M
locus: local
created: 2026-06-09
updated: 2026-06-09
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/feature]
---

## Goal

Extend `packages/mcp-hud` with an HTTP/SSE transport mode, bearer-auth middleware, ACL loader, per-call audit logging, and a `dev|prod` safety hatch so the daemon can serve non-local MCP clients while Emily's existing stdio path remains unchanged.

## Context

Phase B1 code half of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §2. The `mcp-hud` package (built in [[Ticket 15 Scaffold mcp-hud Package with Ping Tool and Shared DB Connection]] and [[Ticket 16 Implement Seven Cashflow MCP Tools with Vitest Coverage]]) runs stdio-only today. The blueprint adds an HTTP/SSE transport mode, selected by `MCP_TRANSPORT=stdio|http`, so Hermes (and future foreign platforms) can call HUD tools across a network boundary.

Key contracts from the blueprint:
- Transport selected by `MCP_TRANSPORT` env var; defaults to `stdio` — Emily's path is unchanged
- Bearer auth: extract `Authorization: Bearer <token>`, argon2id-hash and compare against `mcp-tokens.yaml`
- ACL: load `mcp-acl.yaml`; resolve identity → allowed-tools set; deny-by-default; deny wins over allow on conflict
- Per-call audit: `audit_log` row with `actor=<identity>`, `mcp_request_id=<uuidv7>`, `ip_address=<remote-addr>`, `user_agent='mcp-hud/<ver>'`
- Safety hatch: `HUD_MCP_MODE=dev` uses fixture ACL + hardcoded dev token, binds loopback only, writes `actor='platform:test-*'`. `HUD_MCP_MODE=prod` reads real secrets; fails loudly if files absent or mode ≠ 600

Per `.claude/skills/hud-money/SKILL.md` — amounts are INTEGER minor units. Per `.claude/skills/hud-audit/SKILL.md` — every write produces an `audit_log` row. Also load `plan/blueprints/26060701-hud-agent-runtime-emily.md` for mcp-hud package structure and actor enum design.

Can run in parallel with [[Ticket 36 Author hud-mcp.service Systemd Unit and ACL Token YAML Schemas]] — neither touches the other's files.

## Acceptance Criteria

- [x] `packages/mcp-hud` starts an HTTP/SSE server when `MCP_TRANSPORT=http`; port configurable via env
- [x] Bearer auth middleware: valid token → 200; missing/bad token → 401; right identity but disallowed tool → 403
- [x] ACL loader reads `mcp-acl.yaml`; deny-by-default on unknown identity; deny wins on conflict
- [x] Every MCP call writes an `audit_log` row with `actor`, `mcp_request_id` (uuidv7), `ip_address`, `user_agent='mcp-hud/<ver>'`
- [x] `HUD_MCP_MODE=dev` boots with hardcoded dev token and fixture ACL; `prod` refuses to start if secret files absent or mode ≠ 600
- [x] Emily's stdio path (`MCP_TRANSPORT=stdio`, default) is unaffected — regression test passes
- [x] `pnpm test --filter mcp-hud` green: auth pass/fail, ACL allow/deny per tool, audit row shape, dev-mode token acceptance, prod missing-file boot failure
- [x] Manual local smoke test: `HUD_MCP_MODE=dev ... --transport http --port 7610` + `curl -H 'Authorization: Bearer devtoken' http://127.0.0.1:7610/mcp/...` → 200; bad token → 401; disallowed tool → 403

## Sub-tasks

- [x] Add `MCP_TRANSPORT=stdio|http` flag and HTTP/SSE server wiring to `packages/mcp-hud/src/`
- [x] Implement bearer auth middleware with argon2id verification against `mcp-tokens.yaml`
- [x] Implement ACL loader: read `mcp-acl.yaml`, resolve identity → allowed-tools, deny-by-default
- [x] Add per-call audit logging: `actor`, `mcp_request_id` (uuidv7), `ip_address`, `user_agent`
- [x] Implement `HUD_MCP_MODE=dev|prod` safety hatch
- [x] Write Vitest cases for all AC items
- [x] Regression-test Emily's stdio path
- [x] Run `pnpm test` and `pnpm typecheck`

## Open Questions

## Notes

### 2026-06-09 — implementation

**Files added:**
- `packages/mcp-hud/src/http/types.ts` — shared types: `TokenEntry`, `TokenStore`, `AclEntry`, `AclFile`, `AuthResult`, `AclResult`
- `packages/mcp-hud/src/http/auth.ts` — `loadTokenStore`, `buildDevTokenStore`, `verifyBearer`, `DEV_TOKEN_PLAINTEXT`; argon2id prod verify, constant-time dev compare
- `packages/mcp-hud/src/http/acl.ts` — `loadAclStore`, `buildDevAclStore`, `checkAcl`; deny-by-default; deny wins; glob patterns (`cashflow.*`, `*`)
- `packages/mcp-hud/src/http/context.ts` — `AsyncLocalStorage`-based `httpRequestStorage` for per-request identity injection
- `packages/mcp-hud/src/http/server.ts` — `startHttpServer`: Node.js HTTP server wrapping `StreamableHTTPServerTransport`, auth + ACL middleware, identity injection
- `packages/mcp-hud/src/__tests__/http-auth.test.ts` — 34 tests: auth pass/fail, ACL allow/deny, glob patterns, deny-wins, audit shape, HTTP context injection, dev token, prod boot failure, stdio regression

**Files modified:**
- `packages/mcp-hud/src/index.ts` — `MCP_TRANSPORT=stdio|http` selection; `HUD_MCP_MODE=dev|prod` safety hatch; lazy HTTP module imports; `MCP_HTTP_PORT`, `MCP_TOKENS_PATH`, `MCP_ACL_PATH` env vars; SIGTERM/SIGINT shutdown
- `packages/mcp-hud/src/tools/cashflow.ts` — `resolveCtxFromEnv` checks `httpRequestStorage` first (HTTP mode), falls back to env vars (stdio mode); `writeAudit` enriches rows with HTTP context (`ip_address`, `user_agent`, `mcp_request_id` in `payload_json`) when present
- `packages/mcp-hud/package.json` — added `@node-rs/argon2`, `js-yaml`, `uuidv7` deps; `@types/js-yaml` devDep

**Commits:** 1 (`feat(mcp-hud): add HTTP/SSE transport with bearer auth, ACL, and audit`)

**Test results:** 81 tests pass (47 existing + 34 new); `pnpm typecheck` clean; `pnpm build` clean

**Design notes:**
- `mcp_request_id` stored in `payload_json` (no schema migration needed) — the `audit_log` schema lacks this column; per-request ID correlation via payload works
- `McpServer.connect()` called once; `StreamableHTTPServerTransport` in stateless mode handles multiple POST requests
- The `exactOptionalPropertyTypes: true` tsconfig and SDK's concrete class types required `as unknown as Transport & StreamableHTTPServerTransport` cast — documented inline
- `HUD_MCP_MODE=dev` binds `127.0.0.1` (loopback only) — production tailscale serve handles external exposure
- Emily's stdio path has zero code changes; `getHttpRequestContext()` returns `undefined` when no `AsyncLocalStorage` context is set, preserving all existing behavior

**Open Questions surfaced:** none
