---
id: Ticket 36
title: Author hud-mcp.service Systemd Unit and ACL Token YAML Schemas
status: done
priority: p2
area: infra
estimate: S
locus: local
created: 2026-06-09
updated: 2026-06-09
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Commit the `hud-mcp.service` systemd unit, JSON Schema definitions for `mcp-tokens.yaml` and `mcp-acl.yaml`, example secret files, and a CI validator so the server deploy (Ticket 37) is a clean copy-paste with no freehand authoring.

## Context

Phase B1 schema/infra half of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §2. Can run in parallel with [[Ticket 35 Add HTTP SSE Daemon Mode to mcp-hud with Bearer Auth and ACL]] — neither touches the other's files.

Unit file spec from the blueprint:
- `User=agent-hud`, `Slice=hud.slice`, `Restart=on-failure`, `RestartSec=5s`, `StartLimitBurst=10`
- `EnvironmentFile=/srv/hud/secrets/mcp.env`
- `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`, `ReadWritePaths=/srv/hud/data`

Real secrets (`mcp-tokens.yaml`, `mcp-acl.yaml`) live on the server only, never in git. Example files with placeholder values are committed for documentation and schema verification.

## Acceptance Criteria

- [x] `ops/systemd/hud-mcp.service` committed with all hardening options from the blueprint
- [x] `ops/schemas/mcp-tokens.schema.yaml` and `ops/schemas/mcp-acl.schema.yaml` (JSON Schema in YAML form) committed and correctly describe the token/ACL structures from the blueprint §5
- [x] `ops/secrets/mcp-tokens.example.yaml` and `ops/secrets/mcp-acl.example.yaml` committed with placeholder values; no real tokens; confirmed excluded from git (`.gitignore` or path convention)
- [x] `scripts/validate-mcp-config.ts` validates both YAML files against their schemas; catches a known-bad fixture; exits non-zero on schema violation
- [x] CI runs the validator on every PR (new step or appended to existing CI pipeline)
- [x] `pnpm typecheck` passes

## Sub-tasks

- [x] Write `ops/systemd/hud-mcp.service` per blueprint §2 spec
- [x] Write `ops/schemas/mcp-tokens.schema.yaml` covering `tokens[].identity`, `tokens[].token_hash`, `tokens[].issued`, `tokens[].notes`
- [x] Write `ops/schemas/mcp-acl.schema.yaml` covering `identities.<name>.allow[]`, `identities.<name>.deny[]`
- [x] Write example YAML files with placeholder values; verify they pass the schema validator
- [x] Write a known-bad fixture; verify the validator catches it
- [x] Write `scripts/validate-mcp-config.ts`
- [x] Wire validator into CI
- [x] Run `pnpm typecheck`

## Open Questions

## Notes

### 2026-06-09 — implementation

- Added `ops/systemd/hud-mcp.service`: unit with User=agent-hud, Group=hud, Slice=hud.slice, Restart=on-failure, RestartSec=5s, StartLimitBurst=10, EnvironmentFile=/srv/hud/secrets/mcp.env, ExecReload=SIGHUP for hot config reload, full hardening suite (NoNewPrivileges, ProtectSystem=strict, ProtectHome, PrivateTmp, ReadWritePaths=/srv/hud/data, ProtectKernelTunables, LockPersonality, MemoryDenyWriteExecute, RestrictRealtime, RestrictSUIDSGID)
- Added `ops/schemas/mcp-tokens.schema.yaml`: JSON Schema covering tokens[].identity (pattern-validated platform:/agent: prefix), tokens[].token_hash (argon2id pattern), tokens[].issued (YYYY-MM-DD), tokens[].notes/expires (optional)
- Added `ops/schemas/mcp-acl.schema.yaml`: JSON Schema covering identities map, per-identity allow/deny arrays with toolNameOrGlob pattern supporting camelCase names and glob suffixes (cashflow.createCategory, vault.*, *)
- Added `ops/secrets/mcp-tokens.example.yaml`: two placeholder entries (platform:hermes-gateway, platform:hermes-macbook-a) with fake argon2id hashes
- Added `ops/secrets/mcp-acl.example.yaml`: full blueprint §5 ACL structure with agent:emily/gemini (allow:*), platform:hermes-gateway, platform:hermes-macbook-a
- Added `ops/secrets/fixtures/bad-tokens.yaml` + `bad-acl.yaml`: known-bad fixtures for CI validation testing
- Added `scripts/validate-mcp-config.ts`: AJV 8 + js-yaml validator, strict: false (strips $schema for offline CI), biome-clean, exits 0 on success / 1 on violation
- Added `.github/workflows/ci.yml`: four jobs — typecheck+lint+build, unit tests, validate-mcp-config (example files pass + bad fixtures fail), pnpm 9 + Node 22
- Updated `.gitignore`: exclude ops/secrets/mcp-tokens.yaml and ops/secrets/mcp-acl.yaml (real files, server-only)
- Updated `package.json`: validate:mcp-config script; added ajv, ajv-formats, js-yaml, @types/js-yaml as devDependencies
- Files: 9 added, 3 modified
- Commits: 1 (`feat(infra): author hud-mcp.service, MCP YAML schemas, and CI validator (Ticket 36)`)
- Open Questions surfaced: none — blueprint §5 was complete enough to implement directly
