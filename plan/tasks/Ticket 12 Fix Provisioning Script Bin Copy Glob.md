---
id: Ticket 12
title: Fix Provisioning Script Bin Copy Glob
status: done
priority: p1
area: bug
estimate: S
created: 2026-06-06
updated: 2026-06-06
depends-on: ["[[Ticket 08 Write Tenant Manifests and Discovery Scripts]]"]
blocks: []
blueprint: "[[plan/blueprints/26060503-multi-tenant-server-layout]]"
tags: [task, area/bug]
---

## Goal

Fix `hud-provision.sh` so its artifact copy step deploys all extensionless scripts from `ops/provision/bin/` — not just `*.sh` files.

## Context

Ticket 08 surfaced OQ-1: Section 8 of `ops/provision/hud-provision.sh` (Ticket 07) uses `find ... -name '*.sh'` to copy bin scripts to `/opt/agents/bin/`. All discovery scripts created by Ticket 08 (`hud-map`, `hud-where`, `hud-status`, `hud-tail`, `hud-tenants`, `agent-claude`, `agent-gemini`, `agent-opencode`) have no `.sh` extension per blueprint §5 interface names. At deploy time the copy step silently skips all of them — the Hetzner box would have no agent discovery commands after provisioning.

## Acceptance Criteria

- [x] In `ops/provision/hud-provision.sh`, the artifact copy section for `ops/provision/bin/` uses `find "${SRC_BIN}" -maxdepth 1 -type f` instead of `find "${SRC_BIN}" -maxdepth 1 -name '*.sh'`
- [x] `bash -n ops/provision/hud-provision.sh` still exits 0 after the change
- [x] The change does not affect any other section of the script

## Sub-tasks

- [x] Locate the `find ... -name '*.sh'` line in the bin artifact copy section of `ops/provision/hud-provision.sh`
- [x] Replace `-name '*.sh'` with `-type f`
- [x] Run `bash -n ops/provision/hud-provision.sh` and confirm exit 0

## Open Questions

## Notes

### 2026-06-06 — implementation
- Replaced both `-name '*.sh'` occurrences in Section 8 of `ops/provision/hud-provision.sh` with `-type f` (the `find` driving the `while` loop and the idempotency check); also updated the inline comment. `bash -n` exits 0. Files: 1 modified, 0 added.
