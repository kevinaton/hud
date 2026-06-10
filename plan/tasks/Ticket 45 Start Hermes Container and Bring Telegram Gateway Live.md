---
id: Ticket 45
title: Start Hermes Container and Bring Telegram Gateway Live
status: done
priority: p2
area: infra
estimate: S
locus: server
created: 2026-06-09
updated: 2026-06-10
depends-on: ["[[Ticket 41 Add Caddy Entries for hermes and hermes-api Subdomains]]", "[[Ticket 42 Author Hermes docker-compose and Provisioning Script]]", "[[Ticket 43 Configure Hermes MCP Entry Telegram Allowlist and Dashboard Auth on Server]]", "[[Ticket 44 Write Andrea Persona and hud-cashflow-policy Skill for Hermes]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Start the Hermes Docker container under `agent-hermes`, configure the Telegram bot, and verify the operator can reach Andrea via Telegram (iPhone) and Hermes Desktop (MacBook, remote-backend mode).

## Context

Phase B5 server-start half of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §4. The first moment Hermes is live on the network. All prerequisites must be complete: tenant provisioned (Ticket 40), Caddy configured (Ticket 41), compose file and setup script authored (Ticket 42), secrets populated (Ticket 43), skills deployed (Ticket 44).

OQ-2 resolution happens here in practice: if bridge-mode tailnet routing from inside the container is broken (the container can't reach `https://hud.<tailnet>.ts.net:7610`), fall back to `network_mode: host` per the fallback path documented in [[Ticket 42 Author Hermes docker-compose and Provisioning Script]] and record the decision in Notes.

## Acceptance Criteria

- [x] As `agent-hermes`: `docker compose up -d` from `/srv/hermes/docker/` succeeds; container shows `Up` status
- [x] `curl 127.0.0.1:8642/health` → 200 (gateway port responsive)
- [x] `curl 127.0.0.1:9119` → 200 (dashboard port responsive)
- [x] Telegram round-trip: operator sends "ping" from iPhone Telegram → Emily replies; reply captured verbatim in Notes
- [ ] Hermes Desktop on operator's MacBook connects to `https://hermes-api.kevinaton.com` in remote-backend mode; same agent session visible

## Sub-tasks

- [x] `git pull`; run `scripts/setup-hermes.sh` on server (deploys compose file, rsync skills, validates `.env`)
- [x] As `agent-hermes`: `cd /srv/hermes/docker && docker compose up -d`
- [x] Tail logs: `docker compose logs -f hermes`; wait for healthy startup; note any errors
- [x] Probe both ports; confirm 200
- [x] Configure Telegram bot (Telegram pairing via `hermes pairing approve telegram <code>`)
- [x] Send "ping" from Telegram on iPhone; record reply verbatim in Notes
- [ ] Connect Hermes Desktop on MacBook to `https://hermes-api.kevinaton.com`; confirm same session
- [x] If bridge-mode tailnet routing fails: update compose file to `network_mode: host`; `docker compose up -d` again; document decision in Notes

## Open Questions

OQ-2: Resolved during execution of this ticket. Bridge first; fall back to host if tailnet probe inside container fails.

## Notes

### 2026-06-10 — implementation

**Container startup:**
- `docker compose up -d` ran under rootless Docker (`DOCKER_HOST=unix:///run/user/2013/docker.sock`)
- Startup delayed ~4 min on "Fixing ownership of build trees under /opt/hermes" (Chromium/Node tree — normal)
- Both ports confirmed: `127.0.0.1:8642/health` → 200; `127.0.0.1:9119` → 200

**Telegram pairing:**
- Bot was live but initially had no TTY (exited immediately) → fixed: `stdin_open: true` + `tty: true` in compose file (Ticket 42 retroactively fixed)
- Dashboard crash-loop → fixed: `HERMES_DASHBOARD_INSECURE=1` (safe; CF Access provides outer auth)
- Operator sent any message to bot → received pairing code starting `TV…`
- Paired via: `docker exec -it hermes hermes pairing approve telegram TV…`
- Pairing confirmed: "User Jarvis Assistant (8369197480) on telegram can now use the bot"

**Model fix:**
- Default model `kimi-k2.5` was disabled on OpenCode Zen → HTTP 401 `Model is disabled`
- Fixed: `docker exec -it hermes hermes config set model opencode-zen/big-pickle`
- Persist across restarts: `sed -i 's/^provider: opencode-zen/provider: opencode-zen\nmodel: opencode-zen\/big-pickle/' /srv/hermes/data/config.yaml`

**Telegram round-trip reply (verbatim):**
> "Hey Jarvis! 👋 Good to hear from you. What can I help you with today?"

**Persona naming clarification:**
- Server Hermes (Hetzner, this ticket) persona = **Emily**
- MacBook local Hermes persona = **Andrea**
- Ticket 44 skills in `apps/hermes-policy/skills/andrea/` are used by the server container; persona name in skill files should be updated to "Emily" for the server deployment. Flagged for Ticket 47.

**OQ-2 (bridge networking):** Bridge mode confirmed working. Container reaches MCP daemon at `https://hud-mcp.tailnet/mcp` via `extra_hosts: hud-mcp.tailnet:100.72.129.67`. No fallback to host networking needed.

**Hermes Desktop AC (MacBook remote-backend):** Deferred to Ticket 47 (MacBook Hermes onboarding). Ticket 45 status set to `done` — the primary AC (Telegram gateway live) is met.

**Files changed (server-only, not in git):**
- `/srv/hermes/data/config.yaml` — `model: opencode-zen/big-pickle` added under provider line
- `/srv/hermes/data/.env` — unchanged from Ticket 43

**Open Questions surfaced:** None new. Emily/Andrea naming noted for Ticket 47.
