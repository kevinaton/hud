---
id: Ticket 07
title: Write Hetzner Server Provisioning Script
status: done
priority: p2
area: infra
estimate: M
created: 2026-06-06
updated: 2026-06-06
depends-on: []
blocks: ["[[Ticket 08 Write Tenant Manifests and Discovery Scripts]]"]
blueprint: "[[plan/blueprints/26060503-multi-tenant-server-layout]]"
tags: [task, area/infra]
---

## Goal

Write an idempotent bash script at `ops/provision/hud-provision.sh` that, when run as root on a fresh Hetzner Ubuntu LTS image, creates all required users, groups, systemd slices, directory trees, filesystem permissions, sudoers entries, and base package installs per `[[plan/blueprints/26060503-multi-tenant-server-layout]]` Phase L0.

## Context

Phase 1 of the HUD roadmap is deploying the MVP to Hetzner. Before the app can be deployed, the server must be provisioned with the correct multi-tenant layout defined in `[[plan/blueprints/26060503-multi-tenant-server-layout]]`.

This ticket covers L0 only (users, dirs, slices, sudoers, packages). L1 (tenant manifests + discovery scripts) is `[[Ticket 08 Write Tenant Manifests and Discovery Scripts]]`, which depends on this ticket's design decisions being settled.

The script lives in the app repo at `ops/provision/hud-provision.sh` and is versioned with the codebase. During Phase 1 deploy, the operator rsync's it to the server and runs it once. Re-running is safe (idempotent).

Engineer must review `.claude/skills/hud-db/SKILL.md` if any DB path decisions arise.

## Acceptance Criteria

- [x] `ops/provision/hud-provision.sh` exists, is executable (`chmod +x`), and passes `bash -n ops/provision/hud-provision.sh` (syntax check with zero errors)
- [x] Script starts with `set -euo pipefail` and exits 1 with a descriptive error if `EUID != 0`
- [x] User creation is idempotent (uses `id <user> &>/dev/null || useradd ...` guard): creates `hud` (UID 2001), `portfolio` (UID 2002), `agent-hud` (UID 2011, group=hud), `agent-portfolio` (UID 2012, group=portfolio, shell=/usr/sbin/nologin)
- [x] Directory tree created under `/srv/hud/` with sub-dirs `app/ data/ secrets/ logs/ runtime/ vault/ backups/` at correct modes: `750 hud:hud` for root, `700 hud:hud` for `data/ secrets/ runtime/ backups/`
- [x] Directory tree created under `/srv/portfolio/` with sub-dirs `app/ data/ secrets/ logs/ runtime/ public/ guest-sandbox/` at correct modes: `750 portfolio:portfolio` for root, `755 portfolio:caddy` for `public/`, `770 portfolio:agent-portfolio` for `guest-sandbox/`
- [x] `/opt/agents/bin/` directory created mode 755, owner root:root; any `.sh` scripts already present in `ops/provision/bin/` are copied there and made executable
- [x] `/etc/hud/tenants/` directory created mode 755, owner root:root; any YAML files from `ops/provision/tenants/` are copied there
- [x] Systemd slice unit files written to `/etc/systemd/system/`: `hud.slice` (CPUQuota=80%, MemoryMax=4G), `portfolio.slice` (CPUQuota=40%, MemoryMax=2G), `agents.slice` (CPUQuota=60%, MemoryMax=3G); `systemctl daemon-reload` called after
- [x] `/etc/sudoers.d/hud-operator` written with `kevin ALL=(agent-hud) NOPASSWD: /opt/agents/bin/*`; validated inline with `visudo -c -f /etc/sudoers.d/hud-operator`
- [x] Installs base packages via `apt-get install -y` (with non-interactive env): `sqlite3`, `age`, `fail2ban` (note: Caddy, cloudflared, and litestream each require their own apt repo setup — script adds those repos and installs them too)
- [x] Script prints a per-step summary line (CREATED / SKIPPED / UPDATED) for every idempotent action so the operator can confirm what changed on each run
- [x] Running the script twice in succession on the same system produces no errors and all lines print SKIPPED (idempotency verified by reading the script logic, not a live server)

## Sub-tasks

- [x] Create `ops/provision/` directory in the repo
- [x] Write the script header: shebang, `set -euo pipefail`, usage/root check
- [x] Write user + group creation section (4 users, idempotent guards)
- [x] Write directory tree creation section for `/srv/hud/` and `/srv/portfolio/`
- [x] Write `/opt/agents/bin/` and `/etc/hud/` directory scaffolding section
- [x] Write systemd slice unit file generation section (inline heredocs)
- [x] Write sudoers entry creation section with `visudo -c` validation
- [x] Write apt repo setup and package install section (Caddy, cloudflared, litestream repos + sqlite3, age, fail2ban)
- [x] Write artifact copy section (copies `ops/provision/bin/*` → `/opt/agents/bin/` and `ops/provision/tenants/*` → `/etc/hud/tenants/` if those files exist)
- [x] Write final summary printout
- [x] Run `bash -n ops/provision/hud-provision.sh` and confirm exit 0

## Open Questions

## Notes

### 2026-06-06 — implementation

- Created `ops/provision/hud-provision.sh` — 443-line idempotent bash script for Hetzner Ubuntu LTS L0 provisioning
- Created `ops/provision/bin/` — empty placeholder; scripts placed here at deploy time are copied to `/opt/agents/bin/`
- Created `ops/provision/tenants/` — empty placeholder; YAML files placed here at deploy time are copied to `/etc/hud/tenants/`
- `bash -n ops/provision/hud-provision.sh` exits 0 (confirmed)
- File is `chmod +x` (755)

**Script structure (9 sections):**
1. Header + root guard (`set -euo pipefail`, `EUID != 0` → exit 1)
2. Users/groups — `hud` (2001), `portfolio` (2002), `agent-hud` (2011, gid=hud), `agent-portfolio` (2012, gid=portfolio, nologin); idempotent via `id <user> &>/dev/null` guard; caddy group pre-created
3. `/srv/hud/` tree — root 750, `data/ secrets/ runtime/ backups/` 700, `app/ logs/ vault/` 750, all `hud:hud`
4. `/srv/portfolio/` tree — root 750 `portfolio:portfolio`, `public/` 755 `portfolio:caddy`, `guest-sandbox/` 770 `portfolio:agent-portfolio`
5. `/opt/agents/bin/` (755 root:root), `/etc/hud/tenants/` (755 root:root), `/var/lib/litestream/{hud,portfolio}` (700 root:root)
6. Systemd slices — `hud.slice` (80%/4G), `portfolio.slice` (40%/2G), `agents.slice` (60%/3G) written via `write_slice()` helper using `mktemp` + `cmp -s` for idempotency; `systemctl daemon-reload` called after
7. Sudoers — `kevin ALL=(agent-hud) NOPASSWD: /opt/agents/bin/*` written to `/etc/sudoers.d/hud-operator`; validated with `visudo -c -f` before copy and after; aborts on failure
8. Apt repos — Caddy (cloudsmith), cloudflared (pkg.cloudflare.com), litestream (packagecloud); each guarded by keyring+list existence check; `DEBIAN_FRONTEND=noninteractive`; packages installed with per-pkg dpkg status check for CREATED/SKIPPED output
9. Artifact copy — `find ... -print0` + `while read -d ''` loop; `cmp -s` for idempotency on second run; handles empty source dirs gracefully

**Idempotency design:** every action is guarded before acting. Second run: users → SKIPPED (id check), dirs → SKIPPED (stat mode+owner match), slices → SKIPPED (cmp -s match), sudoers → SKIPPED (grep -qF match), repos → SKIPPED (keyring+list file existence), packages → SKIPPED (dpkg status check), artifacts → SKIPPED (cmp -s match). No errors on re-run.

- Files: 1 added (`ops/provision/hud-provision.sh`), 2 dirs added (`ops/provision/bin/`, `ops/provision/tenants/`)
- Commits: 0 (operator to commit)
- Open Questions surfaced: none
