---
id: Ticket 13
title: Fix Ops Config Paths for Hetzner Deploy
status: done
priority: p1
area: bug
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060503-multi-tenant-server-layout]]"
tags: [task, area/bug]
---

## Goal

Update all ops config files to use `/srv/hud/` paths matching the provisioning script — so the first Hetzner deploy does not fail with missing paths.

## Context

Ticket 06 wrote ops config files using `/var/lib/hud/` paths. Ticket 07's provisioning script creates `/srv/hud/` (the path defined in `[[plan/blueprints/26060503-multi-tenant-server-layout]]` §2). On deploy, `hud-web.service` and `litestream` would point at a directory that does not exist. Three files need updating before any server deploy is attempted.

## Acceptance Criteria

- [x] `ops/systemd/hud-web.service`: `WorkingDirectory=/srv/hud/app`, `EnvironmentFile=/srv/hud/secrets/.env`, `ReadWritePaths=/srv/hud`
- [x] `ops/litestream/litestream.yml`: DB path updated to `/srv/hud/data/hud.db`
- [x] `ops/cloudflared/config.yml`: `credentials-file` updated to `/srv/hud/secrets/.cloudflared/<TUNNEL_ID>.json`
- [x] No other occurrences of `/var/lib/hud` remain in any file under `ops/`
- [x] `caddy validate --config ops/caddy/Caddyfile` still exits 0 (Caddyfile not changed but confirm no regression)
- [x] `bash -n ops/provision/hud-provision.sh` still exits 0

## Sub-tasks

- [x] Update `ops/systemd/hud-web.service` — WorkingDirectory, EnvironmentFile, ReadWritePaths
- [x] Update `ops/litestream/litestream.yml` — DB path
- [x] Update `ops/cloudflared/config.yml` — credentials-file path
- [x] `grep -r "var/lib/hud" ops/` confirms zero results after changes
- [x] Run `caddy validate --config ops/caddy/Caddyfile` and `bash -n ops/provision/hud-provision.sh`

## Open Questions

## Notes

### 2026-06-07 — implementation
- `ops/systemd/hud-web.service`: replaced `WorkingDirectory=/var/lib/hud` → `/srv/hud/app`, `EnvironmentFile=/var/lib/hud/.env` → `/srv/hud/secrets/.env`, `ReadWritePaths=/var/lib/hud` → `/srv/hud`
- `ops/litestream/litestream.yml`: replaced `path: /var/lib/hud/hud.db` → `/srv/hud/data/hud.db`
- `ops/cloudflared/config.yml`: replaced `credentials-file: /var/lib/hud/.cloudflared/<TUNNEL_ID>.json` → `/srv/hud/secrets/.cloudflared/<TUNNEL_ID>.json`
- `grep -r "var/lib/hud" ops/` returned zero results
- `bash -n ops/provision/hud-provision.sh` exited 0
- `caddy validate --config ops/caddy/Caddyfile` exited 0 ("Valid configuration")
- Files: 3 modified, 0 added
- Open Questions surfaced: none
