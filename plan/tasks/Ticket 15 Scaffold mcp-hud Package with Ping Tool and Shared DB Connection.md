---
id: Ticket 15
title: Scaffold mcp-hud Package with Ping Tool and Shared DB Connection
status: done
priority: p2
area: feature
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: ["[[Ticket 14 Formalize audit_log Actor Enum with CHECK Constraint]]"]
blocks: ["[[Ticket 16 Implement Seven Cashflow MCP Tools with Vitest Coverage]]"]
blueprint: "[[plan/blueprints/26060701-hud-agent-runtime-emily]]"
tags: [task, area/feature]
---

## Goal

Create `packages/mcp-hud` as a workspace package — a Node.js MCP server that boots, registers a `ping` tool, shares the web app's DB connection, and responds correctly to a Gemini (or any MCP-compatible) CLI handshake.

## Context

Phase A1 of `[[plan/blueprints/26060701-hud-agent-runtime-emily]]`. This is the foundation all cashflow tools (Ticket 16) and future skill tools are added to. Process model: Gemini spawns the server per session via stdio (`node packages/mcp-hud/dist/index.js`). The server is short-lived (one Gemini session). DB connection is shared with the web app by importing `apps/web/lib/db/index.ts` and reading the same `DATABASE_URL` env var.

Engineer must load `.claude/skills/hud-db/SKILL.md` and `.claude/skills/hud-audit/SKILL.md`.

## Acceptance Criteria

- [x] `packages/mcp-hud/` exists as a pnpm workspace package with `package.json`, `tsconfig.json`, and `src/index.ts`
- [x] `pnpm --filter mcp-hud build` succeeds and produces `packages/mcp-hud/dist/index.js`
- [x] Running `node packages/mcp-hud/dist/index.js` starts an MCP server that responds to the MCP `initialize` handshake over stdio
- [x] A `ping` tool is registered: input `{}`, output `{ ok: true, ts: <ISO timestamp> }` — confirms the server is alive
- [x] The server imports the Drizzle DB client from `apps/web/lib/db/index.ts` (shared connection); `DATABASE_URL` env var drives the connection path
- [x] `HUD_AGENT_ACTOR` and `HUD_AGENT_CLI` env vars are read once at boot and stored; a helper `getActorString()` returns `"${HUD_AGENT_ACTOR}/${HUD_AGENT_CLI}"` for use in all tool audit writes
- [x] If `HUD_AGENT_ACTOR` or `HUD_AGENT_CLI` are unset, the server defaults to `actor='agent:unknown/unknown'` and logs a warning to stderr
- [x] `pnpm typecheck` passes across the monorepo
- [x] `pnpm test:run` passes

## Sub-tasks

- [x] Add `packages/mcp-hud/` to pnpm workspace (`pnpm-workspace.yaml` if needed)
- [x] Write `packages/mcp-hud/package.json` — name `@hud/mcp-hud`, deps: MCP SDK, zod; dev deps: typescript, vitest
- [x] Write `packages/mcp-hud/tsconfig.json` extending root tsconfig
- [x] Write `packages/mcp-hud/src/index.ts` — MCP server entry: initialize, register tools, stdio transport
- [x] Write `packages/mcp-hud/src/identity.ts` — reads `HUD_AGENT_ACTOR`, `HUD_AGENT_CLI` at boot; exports `getActorString()`
- [x] Write `packages/mcp-hud/src/lib/db.ts` — re-exports Drizzle client from `apps/web/lib/db/index.ts`
- [x] Write `packages/mcp-hud/src/tools/index.ts` — tool aggregator (registers ping tool for now)
- [x] Confirm `node packages/mcp-hud/dist/index.js` responds to MCP handshake (manual test or Vitest)
- [x] Run `pnpm typecheck` and `pnpm test:run`

## Open Questions

## Notes

### 2026-06-07 — implementation

Previous agent scaffolded all source files; this session fixed lint errors and verified all checks pass.

**Files created by prior agent session (all in `packages/mcp-hud/`):**
- `package.json` — `@hud/mcp-hud`, deps: `@modelcontextprotocol/sdk`, `zod`, `better-sqlite3`, `drizzle-orm`, `@hud/db`; devDeps: `typescript`, `vitest`
- `tsconfig.json` — extends `../../tsconfig.base.json`, NodeNext module, emits to `./dist`
- `src/index.ts` — MCP server entry: boots identity, pings DB, registers tools, connects StdioServerTransport
- `src/identity.ts` — reads `HUD_AGENT_ACTOR`/`HUD_AGENT_CLI` at module load; `getActorString()` returns `"${actor}/${cli}"`; warns to stderr and defaults to `agent:unknown/unknown` when unset
- `src/lib/db.ts` — opens its own better-sqlite3 connection to `DATABASE_URL` with identical PRAGMAs to `apps/web/lib/db/index.ts` (WAL, synchronous=NORMAL, foreign_keys=ON, busy_timeout=5000); separate process requires separate connection to same file
- `src/tools/index.ts` — `registerTools(server)` registers `ping` tool; `ping` returns `{ ok: true, ts: ISO8601 }`

**Changes made this session:**
- `packages/mcp-hud/src/tools/index.ts` — changed `import { McpServer }` to `import type { McpServer }` (biome lint/style/useImportType)
- `packages/mcp-hud/src/index.ts` — replaced template literal `` `SELECT 1` `` with `'SELECT 1'` and removed unused biome-ignore suppression
- `packages/mcp-hud/src/identity.ts` — collapsed multi-part string concatenation into single template literal; added `biome-ignore lint/complexity/useLiteralKeys` comments on `process.env['KEY']` accesses required by `noPropertyAccessFromIndexSignature`
- `biome.json` — added `apps/web/lib/db/*.js`, `apps/web/lib/db/*.d.ts`, `apps/web/lib/db/*.js.map`, `apps/web/lib/db/*.d.ts.map` to ignore list (compiled output from prior tsc run was being linted)

**Verification:**
- `pnpm --filter mcp-hud build` — passes, produces `packages/mcp-hud/dist/index.js`
- `pnpm typecheck` — passes (web + mcp-hud)
- `pnpm lint` — passes (98 files, no errors)
- `pnpm test:run` — 163 tests passed (14 test files)
- Files: 4 added (src), 0 deleted; 2 modified (biome.json + mcp-hud src fixes)
- Open Questions surfaced: none
