---
id: Ticket 42
title: Author Hermes docker-compose and Provisioning Script
status: todo
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

- [ ] `docker/hermes/docker-compose.yml` committed per blueprint §4 spec; image pinned to a `sha256:` digest (not `:latest`); `docker compose config` lints cleanly
- [ ] `scripts/setup-hermes.sh` is idempotent (running twice does not corrupt state); copies compose file to `/srv/hermes/docker/`; validates required keys in `/srv/hermes/data/.env`; does NOT start the container
- [ ] Setup script includes a tailnet-reachability probe from a throwaway container; defaults to bridge mode; falls back to host mode with clear log message if probe fails
- [ ] `plan/reference/hermes-ops.md` created documenting: digest pin + update workflow; setup script usage; day-2 ops (restart, log tailing, OOM response per blueprint risks table)
- [ ] OQ-2 decision (bridge vs host) documented in both compose file comment and `hermes-ops.md`

## Sub-tasks

- [ ] Look up current `nousresearch/hermes-agent` image digest (`docker pull nousresearch/hermes-agent:latest` + `docker inspect --format='{{index .RepoDigests 0}}'`)
- [ ] Write `docker/hermes/docker-compose.yml` per blueprint §4 (bridge networking, extra_hosts, ports to loopback only, resource limits 4G/2cpu)
- [ ] Run `docker compose config` to verify
- [ ] Write `scripts/setup-hermes.sh` with tailnet probe, idempotent file copy, and `.env` key validation
- [ ] Write `plan/reference/hermes-ops.md`
- [ ] Commit all three artifacts

## Open Questions

OQ-2: Default bridge; script probes tailnet reachability; fallback to host documented.
OQ-6: Resolved — pin to `sha256:` digest at authoring time; update procedure in `hermes-ops.md`.

## Notes
