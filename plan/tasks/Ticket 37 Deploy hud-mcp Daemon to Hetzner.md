---
id: Ticket 37
title: Deploy hud-mcp Daemon to Hetzner
status: todo
priority: p2
area: infra
estimate: S
locus: server
created: 2026-06-09
updated: 2026-06-09
depends-on: ["[[Ticket 35 Add HTTP SSE Daemon Mode to mcp-hud with Bearer Auth and ACL]]", "[[Ticket 36 Author hud-mcp.service Systemd Unit and ACL Token YAML Schemas]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Install and start `hud-mcp.service` on Hetzner with real argon2id-hashed tokens and ACL so the daemon is live, writing audit rows, and reachable on localhost before Tailscale is layered on top.

## Context

Phase B1 server/deploy half of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §2. Depends on [[Ticket 35 Add HTTP SSE Daemon Mode to mcp-hud with Bearer Auth and ACL]] (daemon code) and [[Ticket 36 Author hud-mcp.service Systemd Unit and ACL Token YAML Schemas]] (unit file + schemas) both merged and built.

This is server-only work (SSH session). The operator generates tokens here; they are stored only in `/srv/hud/secrets/` and the operator's password manager — never committed to git. Three tokens are generated: `platform:hermes-gateway`, `platform:hermes-macbook-a`, plus one rotation spare.

## Acceptance Criteria

- [ ] `/srv/hud/secrets/mcp-tokens.yaml` and `mcp-acl.yaml` created, mode 600, owner `agent-hud`; argon2id-hashed tokens for `platform:hermes-gateway`, `platform:hermes-macbook-a`, plus one rotation spare
- [ ] `hud-mcp.service` installed via `cp ops/systemd/hud-mcp.service /etc/systemd/system/`; `daemon-reload`; `enable --now`
- [ ] `systemctl status hud-mcp.service` → `active (running)`
- [ ] `journalctl -u hud-mcp -n 50` is clean (no errors)
- [ ] `curl -H 'Authorization: Bearer <real-token>' http://127.0.0.1:7610/mcp/...` → 200 from the Hetzner host
- [ ] Bad token → 401; good token + disallowed tool → 403
- [ ] `audit_log` contains a row with `actor='platform:hermes-gateway'` and `mcp_request_id` populated after the probe
- [ ] Emily's stdio MCP still works (regression: Emily `cashflow.list` via Claude or OpenCode returns results)

## Sub-tasks

- [ ] `git pull` on server; `pnpm build --filter mcp-hud`
- [ ] Generate three tokens (gateway, macbook-a, spare) using argon2id; write `mcp-tokens.yaml`
- [ ] Write `mcp-acl.yaml` with identities from blueprint §5 (hermes-gateway and hermes-macbook-a allow/deny lists)
- [ ] Set mode 600 and owner `agent-hud` on both files
- [ ] Install unit: `cp ops/systemd/hud-mcp.service /etc/systemd/system/`; `systemctl daemon-reload`; `systemctl enable --now hud-mcp.service`
- [ ] Probe: curl with good token → 200; curl with bad token → 401; curl disallowed tool → 403
- [ ] Verify `audit_log` row has `mcp_request_id` populated
- [ ] Regression: Emily stdio MCP still returns results

## Open Questions

## Notes
