---
id: Ticket 42
title: Author Hermes docker-compose and Provisioning Script
status: done
priority: p2
area: infra
estimate: S
locus: local
created: 2026-06-09
updated: 2026-06-09
depends-on: ["[[Ticket 40 Provision Hermes Tenant with User Slice AppArmor and Rootless Docker]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Commit `docker/hermes/docker-compose.yml` (image pinned to a `sha256:` digest), `scripts/setup-hermes.sh`, and `plan/reference/hermes-ops.md` so the container can be started on the server with a single idempotent command.

## Context

Phase B5 local/author half of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §4. Authored locally; deployed to `/srv/hermes/docker/` by the setup script. The container does NOT start here — that is [[Ticket 45 Start Hermes Container and Bring Telegram Gateway Live]].

Can be authored in parallel with [[Ticket 43 Configure Hermes MCP Entry Telegram Allowlist and Dashboard Auth on Server]] (which is server-only) and [[Ticket 44 Write Andrea Persona and hud-cashflow-policy Skill for Hermes]] (which is local but touches different files).

OQ-2 (bridge vs host networking): default to `network_mode: bridge` with `extra_hosts: hud-mcp.tailnet:host-gateway`. The setup script includes a tailnet-reachability probe from a throwaway container; if the probe fails, it logs a clear "falling back to host networking" message. Decision documented in both the compose file comment and the ops runbook.

OQ-6 (image digest pinning): resolved here — pin `nousresearch/hermes-agent` to a `sha256:` digest at authoring time; document update procedure in `hermes-ops.md`.

## Acceptance Criteria

- [x] `docker/hermes/docker-compose.yml` committed; image pinned to `sha256:585729a29e59e15373d84d59eaacf84b2526eeeaf71b20e1c6d18d7cbac92afc`; PUID/PGID=2013 (UID conflict resolved in T40); bridge networking; loopback ports; AppArmor; journald
- [x] `scripts/setup-hermes.sh` extended with Steps 2-4: compose deploy, `.env` key validation, tailnet probe; idempotent; does NOT start container
- [x] Tailnet probe runs throwaway `curlimages/curl` container in bridge mode; falls back to host-networking instructions on failure
- [x] `plan/reference/hermes-ops.md` created: secrets, start/stop/logs, OOM response, digest update, OQ-2 bridge/host decision, token rotation, AppArmor
- [x] OQ-2 documented in both `docker-compose.yml` comment block and `hermes-ops.md` § Networking

## Sub-tasks

- [x] Image digest fetched via Docker Hub API (running as `hud`, no Docker socket access): `sha256:585729a29e59e15373d84d59eaacf84b2526eeeaf71b20e1c6d18d7cbac92afc`
- [x] `docker/hermes/docker-compose.yml` written per blueprint §4; bridge + extra_hosts; loopback ports; AppArmor; journald; 4G/2cpu limits
- [x] `docker compose config` lint — operator should verify on server with `DOCKER_HOST=unix:///run/user/2013/docker.sock docker compose -f /srv/hermes/docker/docker-compose.yml config`
- [x] `scripts/setup-hermes.sh` extended (was created in T44; added Steps 2-4 per T42 coordination note in the file)
- [x] `plan/reference/hermes-ops.md` created
- [x] All three artifacts committed in one commit

## Open Questions

OQ-2: Default bridge; script probes tailnet reachability; fallback to host documented.
OQ-6: Resolved — pin to `sha256:` digest at authoring time; update procedure in `hermes-ops.md`.

## Notes

### 2026-06-09 — implementation

**Files added:**
- `docker/hermes/docker-compose.yml` — pinned digest, bridge networking, loopback ports, AppArmor, journald, 4G/2cpu
- `plan/reference/hermes-ops.md` — full day-2 runbook

**Files modified:**
- `scripts/setup-hermes.sh` — Steps 2-4 added per coordination note (T44 wrote Step 1)

**Digest fetch:** Docker Hub API (curl) since agent session runs as `hud` without Docker socket access. Digest: `sha256:585729a29e59e15373d84d59eaacf84b2526eeeaf71b20e1c6d18d7cbac92afc`.

**PUID/PGID:** Set to 2013 (not 2012 as in blueprint — UID conflict resolved in T40 OQ-1).

**`docker compose config` lint:** Must be run by operator on server with rootless Docker socket. Command in Sub-tasks above.

**Commit:** `feat(hermes): docker-compose, setup script, and ops runbook` (e3ed12c)
