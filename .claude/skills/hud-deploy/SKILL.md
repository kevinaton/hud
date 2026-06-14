---
name: hud-deploy
description: Production deploy constraints for the HUD server — memory limits, swap, safe rebuild pattern, and the deploy script. Load this whenever a ticket touches build scripts, package.json scripts, systemd units, or anything that runs pnpm build on the production server.
---

# HUD Deploy

## Server hardware (Hetzner VPS)

| Resource | Value |
|---|---|
| RAM | 3.7 GB |
| CPUs | 2 |
| Swap | 4 GB swapfile at `/swapfile` (added once via `scripts/add-swap.sh`) |
| `vm.swappiness` | 10 (only swap when nearly full) |

**Running processes that must stay alive during a build:**
- `hud-web.service` — the Next.js app (port 3000 behind Cloudflare Tunnel)
- `hud-logs-ingest.service` + `.timer` — Airbnb Gmail ingest, fires every 15 min
- `hud-mcp.service` — the MCP server for Hermes (Telegram bot)

## Why `pnpm build` used to crash everything

`next build` (SWC compiler + static page generation) peaks at **1.5–2.5 GB of RAM**. With only ~985 MB free at runtime and **zero swap**, the Linux OOM killer fires and kills whichever processes it can — the web app, Hermes, all of them.

## Permanent fix: memory cap baked into the build script

`apps/web/package.json` build script is:
```json
"build": "NODE_OPTIONS='--max-old-space-size=1536' next build"
```

This is **already in the repo**. Every `pnpm build` — from the root, from CI, from anywhere — runs with a 1.5 GB V8 heap cap. Do **not** remove this flag.

**Why 1536 MB:**
- Leaves ~2 GB for the OS + running services during build
- Tells V8's GC to be aggressive rather than accumulating garbage hoping to avoid a GC pause
- Combined with the swapfile, the build slows down if it hits the cap but nothing gets killed

## Safe deploy procedure

Always use `scripts/deploy.sh` (or `pnpm deploy`) for production deploys. Never run raw `pnpm build && systemctl restart hud-web` manually — if the build fails mid-way, raw `systemctl restart` would restart against a broken `.next/` output.

```bash
pnpm deploy
# or
bash scripts/deploy.sh
```

What `deploy.sh` does:
1. Warns if swap is missing (run `sudo bash scripts/add-swap.sh` once if so)
2. `git pull --ff-only`
3. `pnpm install --frozen-lockfile`
4. `pnpm db:migrate`
5. `NODE_OPTIONS='--max-old-space-size=1536' nice -n 19 pnpm build`
6. `sudo systemctl restart hud-web` — **only if build succeeded**
7. Verifies `hud-web` is active after restart

The `nice -n 19` in the deploy script keeps CPU scheduling priority low so `hud-web` stays responsive to Cloudflare Tunnel requests during the build. This is in the script only (not in `package.json`) because it affects the whole process tree, not just Node.

## Rules for engineers

- **Never remove `NODE_OPTIONS='--max-old-space-size=1536'` from the build script.** If you need more headroom, increase the value but document it in this skill.
- **Never add `pnpm build` to a service that runs automatically without the memory cap.** Any systemd unit or cron that runs the build must include `Environment=NODE_OPTIONS=--max-old-space-size=1536`.
- **Never run a build without swap active.** Check with `free -h` before any manual build. If `Swap: 0`, run `sudo bash scripts/add-swap.sh` first.
- **The deploy script restarts only `hud-web`.** Hermes (`hud-mcp.service`) and the ingest timer do not need a restart after a code deploy — they read code once at start and don't hot-reload.
- **DB migrations run before the build.** The schema must match the code being compiled.

## Adding swap (one-time, root required)

```bash
sudo bash scripts/add-swap.sh
```

Idempotent. Creates `/swapfile` (4 GB), sets `vm.swappiness=10`, and adds to `/etc/fstab`.

## When this skill applies

Load this skill when a ticket touches:
- `apps/web/package.json` scripts
- Root `package.json` scripts
- `scripts/deploy.sh` or `scripts/add-swap.sh`
- Any systemd unit under `/etc/systemd/system/hud-*.service`
- Anything described as "rebuild", "deploy", "restart", or "OOM"
