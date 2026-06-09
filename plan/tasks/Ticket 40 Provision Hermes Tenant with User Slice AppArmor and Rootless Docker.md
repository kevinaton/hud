---
id: Ticket 40
title: Provision Hermes Tenant with User Slice AppArmor and Rootless Docker
status: todo
priority: p2
area: infra
estimate: M
locus: server
created: 2026-06-09
updated: 2026-06-09
depends-on: ["[[Ticket 39 Add Per-Identity Rate Limiter and Observability to mcp-hud]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Stand up the complete server-side Hermes tenant isolation: `agent-hermes` unix user (UID 2012), `/srv/hermes/` directory layout, `hermes.slice` resource caps, rootless Docker daemon under `agent-hermes`, and an AppArmor `hermes-agent` profile that denies read access to all other tenant data.

## Context

Phase B4 tenant provisioning of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §3, following the tenant recipe in `plan/blueprints/26060503-multi-tenant-server-layout.md`. This creates the isolation layer for the Hermes Docker container — without it, all B5 tickets (42, 43, 44, 45) cannot proceed.

Key constraints from the blueprint:
- `agent-hermes` UID 2012, primary group `agent-hermes`, supplementary group `hud-mcp-clients`
- `hermes.slice`: CPU 60%, MemoryMax 4G, TasksMax 512 (higher than Emily's slice — Playwright/Chromium is hungry)
- Rootless Docker: `loginctl enable-linger agent-hermes`; rootless daemon via `systemctl --user`
- AppArmor `hermes-agent` profile: deny reads to `/srv/hud/`, `/srv/portfolio/`, `/root/`, `/etc/sudoers*`, `/home/`; allow reads under `/srv/hermes/` only

## Acceptance Criteria

- [ ] `id agent-hermes` returns UID 2012; groups include `agent-hermes` and `hud-mcp-clients`
- [ ] `/srv/hermes/{data,docker,logs}/` exists with ownership `agent-hermes:agent-hermes` and modes per blueprint §3 (0750 root, 0700 data/)
- [ ] `systemctl status hermes.slice` → active
- [ ] `systemctl --user --machine=agent-hermes@.host status docker` → active (rootless Docker daemon running)
- [ ] As `agent-hermes`: `cat /srv/hud/data/hud.db` → permission denied (AppArmor enforced)
- [ ] As `agent-hermes`: `cat /srv/hermes/data/.env` → succeeds if file exists (own data readable)
- [ ] `aa-status` lists `hermes-agent` profile in enforce mode

## Sub-tasks

- [ ] Create group `hud-mcp-clients` if not exists
- [ ] Create `agent-hermes` user: UID 2012, home `/srv/hermes`, shell `/bin/bash`, supplementary group `hud-mcp-clients`
- [ ] Create `/srv/hermes/{data,docker,logs}/` with correct ownership and modes
- [ ] Write and install `/etc/systemd/system/hermes.slice` (CPUQuota=60%, MemoryMax=4G, TasksMax=512); `systemctl daemon-reload`; `systemctl start hermes.slice`
- [ ] Enable rootless Docker: `loginctl enable-linger agent-hermes`; `systemctl --user --machine=agent-hermes@.host enable --now docker`
- [ ] Write AppArmor profile `hermes-agent` with deny rules per blueprint §3; load with `apparmor_parser -r`; set to enforce
- [ ] Verify isolation: `su -s /bin/bash agent-hermes -c 'cat /srv/hud/data/hud.db'` → denied
- [ ] Confirm `aa-status | grep hermes-agent` shows enforce

## Open Questions

## Notes
