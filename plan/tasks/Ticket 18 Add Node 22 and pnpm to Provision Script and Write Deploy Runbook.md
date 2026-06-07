---
id: Ticket 18
title: Add Node 22 and pnpm to Provision Script and Write Deploy Runbook
status: done
priority: p1
area: ops
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: ["[[Ticket 07 Write Hetzner Server Provisioning Script]]"]
blocks: []
blueprint: "[[plan/blueprints/26060503-multi-tenant-server-layout]]"
tags: [task, area/ops]
---

## Goal

Two deliverables:
1. Extend `ops/provision/hud-provision.sh` to install Node 22 LTS (via NodeSource) and pnpm (via Corepack) on the Hetzner server so `pnpm build` works after git clone.
2. Write `ops/DEPLOY.md` — a step-by-step deploy runbook covering everything a human operator needs to do after running the provision script to get the app live.

## Context

`hud-provision.sh` installs Caddy, cloudflared, and Litestream but does NOT install Node or pnpm. Without Node 22 on the server, `pnpm build` and `pnpm --filter @hud/mcp-hud build` will fail after git clone.

The deploy runbook documents the manual steps (secrets placement, git clone, build, migrations, systemd activation, CF Tunnel setup, Litestream activation) so the operator has a single reference during deploy.

## Acceptance Criteria

### Provision script
- [x] `ops/provision/hud-provision.sh` installs Node 22 LTS via NodeSource apt repo (same idempotent pattern as existing Caddy/cloudflared sections)
- [x] After Node install, enables Corepack and installs pnpm via `corepack enable && corepack prepare pnpm@latest --activate`
- [x] Script remains idempotent — running it twice prints SKIPPED for Node and pnpm if already installed
- [x] `node --version` on server reports `22.x`; `pnpm --version` works

### Deploy runbook (`ops/DEPLOY.md`)
- [x] Covers all 8 deploy steps in order:
  1. SSH to server and run `sudo ./ops/provision/hud-provision.sh`
  2. Place `/srv/hud/secrets/.env` (list required env vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `SENTRY_DSN`)
  3. Place Cloudflare Tunnel credentials at `/srv/hud/secrets/.cloudflared/<TUNNEL_ID>.json`; set `TUNNEL_ID` in `.env`
  4. Configure Litestream R2 credentials in `.env` (`LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY`, `LITESTREAM_BUCKET`)
  5. `git clone` repo to `/srv/hud/app`; set correct ownership (`hud:hud`)
  6. `cd /srv/hud/app && pnpm install && pnpm build && pnpm --filter @hud/mcp-hud build`
  7. Run DB migrations: `cd apps/web && pnpm db:migrate`
  8. Enable and start services: `systemctl enable --now hud-web litestream cloudflared`
- [x] Each step notes the expected output or verification command
- [x] Includes a "Verify everything is live" section: curl the app URL, check `systemctl status hud-web`, check Litestream replication

## Sub-tasks

- [x] Add NodeSource repo + Node 22 install section to `hud-provision.sh` (after Litestream section, before package install)
- [x] Add `corepack enable && corepack prepare pnpm@latest --activate` step (idempotent)
- [x] Write `ops/DEPLOY.md` with all 8 steps

## Open Questions

## Notes

### 2026-06-07 — implementation

- Modified `ops/provision/hud-provision.sh`:
  - Added NodeSource repo section (lines ~343–351): checks for `/etc/apt/sources.list.d/nodesource.list` before running the `curl | bash` setup script — idempotent, prints SKIPPED/CREATED.
  - Added `nodejs` to the `PACKAGES` array — installed via the existing per-package idempotent loop.
  - Added pnpm section (after package loop, before Section 8): `command -v pnpm` guard, then `corepack enable && corepack prepare pnpm@latest --activate`.
  - Updated final summary block to list Node 22 and pnpm as installed runtimes.
- Created `ops/DEPLOY.md`:
  - 8 ordered steps covering provision, secrets, Cloudflare Tunnel, Litestream R2, git clone, pnpm build, db:migrate, systemd enable.
  - Each step includes expected output and verification commands.
  - "Verify Everything Is Live" section covers: `curl` app URL, `systemctl status` for all three services, `journalctl -f`, Litestream replication check.
  - Bonus "Re-deploy Checklist" section for code-change re-deploys.
- Files: 1 modified, 1 created
- Commits: not yet committed (pending operator review)
- Open Questions surfaced: none
