---
id: Ticket 40
title: Provision Hermes Tenant with User Slice AppArmor and Rootless Docker
status: done
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

- [x] `id agent-hermes` returns UID 2013 (2012 taken by agent-portfolio — see OQ-1); groups include `agent-hermes` and `hud-mcp-clients`
- [x] `/srv/hermes/{data,docker,logs}/` exists with ownership `agent-hermes:agent-hermes` and modes per blueprint §3 (0750 root, 0700 data/)
- [x] `systemctl status hermes.slice` → active since 12:16:45 UTC
- [x] `systemctl --user --machine=agent-hermes@.host status docker` → active (running) since 12:20:54 UTC
- [x] As `agent-hermes`: `cat /srv/hud/data/hud.db` → permission denied ✓
- [x] As `agent-hermes`: own data readable (directory accessible under `/srv/hermes/`)
- [x] `aa-status` lists `hermes-agent` profile in enforce mode

## Sub-tasks

- [x] Create group `hud-mcp-clients` (gid=2020)
- [x] Create `agent-hermes` user: UID 2013, home `/srv/hermes`, shell `/bin/bash`, supplementary group `hud-mcp-clients`
- [x] Create `/srv/hermes/{data,docker,logs}/` with correct ownership and modes
- [x] Write and install `/etc/systemd/system/hermes.slice` (CPUQuota=60%, MemoryMax=4G, TasksMax=512); daemon-reload; started
- [x] Enable rootless Docker: linger enabled; subuid/subgid entries added; `dockerd-rootless-setuptool.sh install`; docker.service active
- [x] Write AppArmor profile `hermes-agent`; loaded via `apparmor_parser -r`; enforce mode confirmed
- [x] Verify isolation: `cat /srv/hud/data/hud.db` → permission denied ✓
- [x] Confirm `aa-status | grep hermes-agent` shows enforce ✓

## Open Questions

**OQ-1 — UID conflict:** Blueprint says `agent-hermes UID 2012`, but `agent-portfolio` is already UID 2012 on the server (provisioned by `hud-provision.sh` from blueprint `26060503`). Implementation uses UID **2013** for `agent-hermes`. Architect should reconcile the two blueprints and update the canonical UID assignment table.

## Notes

### 2026-06-09 — implementation

**Files added:**
- `ops/systemd/hermes.slice` — CPUQuota=60%, MemoryMax=4G, TasksMax=512
- `ops/apparmor/hermes-agent` — deny /srv/hud/, /srv/portfolio/, /root/, /home/, /etc/sudoers*; allow /srv/hermes/**
- `ops/provision/provision-hermes.sh` — idempotent provisioner; installs Docker CE + rootless extras, creates user/group/dirs, loads AppArmor profile

**UID conflict:** Blueprint specifies UID 2012 for `agent-hermes` but `agent-portfolio` (from blueprint 26060503) occupies that slot. Used **UID 2013** — documented in OQ-1.

**Extra manual step required (not in script):** `dockerd-rootless-setuptool.sh` requires `/etc/subuid` and `/etc/subgid` entries. Script printed the commands; operator added them and re-ran the rootless setup.

**Verified on server:**
- `id agent-hermes` → uid=2013, groups: agent-hermes + hud-mcp-clients ✓
- `/srv/hermes/{data,docker,logs}/` → correct modes and ownership ✓
- `hermes.slice` → active ✓
- Rootless Docker → active (running), CGroup: /user.slice/user-2013.slice ✓
- `aa-status` → hermes-agent in enforce mode ✓
- `cat /srv/hud/data/hud.db` as agent-hermes → Permission denied ✓

**Commits:** 1 (`feat(hermes): add tenant provisioning artifacts — slice, AppArmor, provision script`)
