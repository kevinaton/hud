---
id: Ticket 45
title: Start Hermes Container and Bring Telegram Gateway Live
status: todo
priority: p2
area: infra
estimate: S
locus: server
created: 2026-06-09
updated: 2026-06-09
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

- [ ] As `agent-hermes`: `docker compose up -d` from `/srv/hermes/docker/` succeeds; container shows `Up` status
- [ ] `curl 127.0.0.1:8642/health` → 200 (gateway port responsive)
- [ ] `curl 127.0.0.1:9119` → 200 (dashboard port responsive)
- [ ] Telegram round-trip: operator sends "ping" from iPhone Telegram → Andrea replies; reply captured verbatim in Notes
- [ ] Hermes Desktop on operator's MacBook connects to `https://hermes-api.kevinaton.com` in remote-backend mode; same agent session visible

## Sub-tasks

- [ ] `git pull`; run `scripts/setup-hermes.sh` on server (deploys compose file, rsync skills, validates `.env`)
- [ ] As `agent-hermes`: `cd /srv/hermes/docker && docker compose up -d`
- [ ] Tail logs: `docker compose logs -f hermes`; wait for healthy startup; note any errors
- [ ] Probe both ports; confirm 200
- [ ] Configure Telegram bot (via Hermes dashboard or CLI per Hermes docs)
- [ ] Send "ping" from Telegram on iPhone; record reply verbatim in Notes
- [ ] Connect Hermes Desktop on MacBook to `https://hermes-api.kevinaton.com`; confirm same session
- [ ] If bridge-mode tailnet routing fails: update compose file to `network_mode: host`; `docker compose up -d` again; document decision in Notes

## Open Questions

OQ-2: Resolved during execution of this ticket. Bridge first; fall back to host if tailnet probe inside container fails.

## Notes
