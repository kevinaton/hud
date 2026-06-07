---
id: Ticket 08
title: Write Tenant Manifests and Discovery Scripts
status: done
priority: p2
area: infra
estimate: S
created: 2026-06-06
updated: 2026-06-06
depends-on: ["[[Ticket 07 Write Hetzner Server Provisioning Script]]"]
blocks: []
blueprint: "[[plan/blueprints/26060503-multi-tenant-server-layout]]"
tags: [task, area/infra]
---

## Goal

Write declarative YAML tenant manifests and shell discovery scripts under `ops/provision/` that describe the multi-tenant server layout defined in `[[plan/blueprints/26060503-multi-tenant-server-layout]]` Phase L1, so any agent SSHed into the Hetzner box can orient itself in under 10 seconds.

## Context

Phase L1 of `[[plan/blueprints/26060503-multi-tenant-server-layout]]`. The provisioning script from `[[Ticket 07 Write Hetzner Server Provisioning Script]]` creates users, dirs, and slices. This ticket writes the metadata layer: machine-readable tenant manifests (`/etc/hud/tenants/*.yml`) and the discovery scripts (`/opt/agents/bin/hud-*`) that every agent reads on arrival.

The `hud-provision.sh` (Ticket 07) already handles copying `ops/provision/tenants/*.yml` → `/etc/hud/tenants/` and `ops/provision/bin/*` → `/opt/agents/bin/` during server provisioning. This ticket only writes the source files; they are consumed by the provisioning script at deploy time.

**Canonical examples** are in the blueprint §5 (server-map.md), §6 (tenant YAML), and the discovery-command table.

## Acceptance Criteria

- [x] `ops/provision/tenants/hud.yml` exists and is valid YAML (check: `python3 -c "import yaml; yaml.safe_load(open('ops/provision/tenants/hud.yml'))"` exits 0) with all fields from blueprint §6: `name`, `description`, `owner_user`, `owner_group`, `agent_user`, `slice`, `root`, `domain`, `public`, `auth`, `upstream`, `db` (engine, path, replication, destination), `services`, `trust_level`
- [x] `ops/provision/tenants/portfolio.yml` exists and is valid YAML with the same schema: `name: portfolio`, `domain: kevinaton.com`, `public: true`, no `auth` field, `upstream: 127.0.0.1:3001`, `trust_level: medium`
- [x] `ops/provision/server-map.md` exists and contains all four sections from blueprint §5: `## Tenants` (hud + portfolio sub-sections), `## Shared`, `## Operational conventions`, `## Discovery commands`
- [x] `ops/provision/bin/hud-map` exists: prints `/etc/hud/server-map.md` via `${PAGER:-less}`
- [x] `ops/provision/bin/hud-where` exists: accepts a tenant name arg, reads `/etc/hud/tenants/<tenant>.yml` with `python3`/`yq`, and prints the `root`, `db.path`, `services` fields; exits 1 with a message if tenant not found
- [x] `ops/provision/bin/hud-status` exists: runs `systemctl --no-pager status hud-web.service hud-litestream.service portfolio-web.service caddy.service cloudflared.service`
- [x] `ops/provision/bin/hud-tail` exists: accepts a tenant arg and runs `journalctl -fu ${1}-web`
- [x] `ops/provision/bin/hud-tenants` exists: runs `ls /etc/hud/tenants/`
- [x] `ops/provision/bin/agent-claude` exists: `exec sudo -u agent-hud -E claude "$@"`
- [x] `ops/provision/bin/agent-gemini` exists: `exec sudo -u agent-hud -E gemini "$@"`
- [x] `ops/provision/bin/agent-opencode` exists: `exec sudo -u agent-hud -E opencode "$@"`
- [x] All scripts in `ops/provision/bin/` begin with `#!/usr/bin/env bash` and `set -euo pipefail`, are executable, and pass `bash -n` syntax check

## Sub-tasks

- [x] Create `ops/provision/tenants/` and `ops/provision/bin/` directories
- [x] Write `ops/provision/tenants/hud.yml` per blueprint §6 template
- [x] Write `ops/provision/tenants/portfolio.yml` with portfolio-specific values
- [x] Write `ops/provision/server-map.md` per blueprint §5 example (all four sections)
- [x] Write `ops/provision/bin/hud-map`
- [x] Write `ops/provision/bin/hud-where` (with YAML parsing via `python3 -c "import yaml..."` or `yq`)
- [x] Write `ops/provision/bin/hud-status`
- [x] Write `ops/provision/bin/hud-tail`
- [x] Write `ops/provision/bin/hud-tenants`
- [x] Write `ops/provision/bin/agent-claude`, `agent-gemini`, `agent-opencode`
- [x] `chmod +x ops/provision/bin/*`
- [x] Run `bash -n ops/provision/bin/*` and confirm all pass
- [x] Run `python3 -c "import yaml; yaml.safe_load(open(...))"` on both YAML files and confirm exit 0

## Open Questions

**OQ-1 (surfaced 2026-06-06):** `hud-provision.sh` Section 8 copies only `*.sh` files from `ops/provision/bin/` via `find ... -name '*.sh'`. The scripts created by this ticket have no `.sh` extension (per blueprint §5 interface names: `hud-map`, `hud-where`, etc.). At deploy time, the provisioner's artifact copy step will silently skip all bin scripts. The provisioning script should be updated to use `find "${SRC_BIN}" -maxdepth 1 -type f` instead of `-name '*.sh'`. This requires a fix in `hud-provision.sh` (Ticket 07 artifact) — not touched here per the "no drive-by refactors" rule.

## Notes

### 2026-06-06 — implementation

- Created `ops/provision/tenants/hud.yml` — full blueprint §6 schema (name, description, owner_user, owner_group, agent_user, slice, root, domain, public, auth, upstream, db.engine/path/replication/destination, services, trust_level)
- Created `ops/provision/tenants/portfolio.yml` — portfolio-specific values: domain kevinaton.com, public: true, no auth field, upstream 127.0.0.1:3001, trust_level: medium
- Created `ops/provision/server-map.md` — all four blueprint §5 sections: Tenants (hud + portfolio), Shared, Operational conventions, Discovery commands
- Created `ops/provision/bin/hud-map` — exec ${PAGER:-less} /etc/hud/server-map.md
- Created `ops/provision/bin/hud-where` — python3 yaml.safe_load on /etc/hud/tenants/<tenant>.yml, prints root/db.path/services, exits 1 if not found
- Created `ops/provision/bin/hud-status` — systemctl --no-pager status of 5 service units
- Created `ops/provision/bin/hud-tail` — journalctl -fu ${1}-web
- Created `ops/provision/bin/hud-tenants` — ls /etc/hud/tenants/
- Created `ops/provision/bin/agent-claude`, `agent-gemini`, `agent-opencode` — exec sudo -u agent-hud -E <cli> "$@"
- All 8 scripts: chmod +x, pass `bash -n`, begin with `#!/usr/bin/env bash` and `set -euo pipefail`
- Both YAML files pass `python3 -c "import yaml; yaml.safe_load(open(...))"` exit 0
- Files: 11 created (2 YAML + 1 md + 8 scripts), 0 modified
- Open Questions surfaced: OQ-1 — provisioning script bin copy uses `*.sh` glob and will skip these extensionless scripts; needs a one-line fix in hud-provision.sh
