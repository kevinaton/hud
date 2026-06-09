---
id: Ticket 38
title: Install Tailscale on Hetzner and Configure tailscale serve for MCP
status: todo
priority: p2
area: infra
estimate: S
locus: server
created: 2026-06-09
updated: 2026-06-09
depends-on: ["[[Ticket 37 Deploy hud-mcp Daemon to Hetzner]]"]
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/infra]
---

## Goal

Join Hetzner to the operator's tailnet, expose `hud-mcp.service` at a Tailscale-managed HTTPS endpoint on port 7610, and commit the Tailscale ACL policy so only `tag:hermes-client` nodes can reach the MCP endpoint.

## Context

Phase B2 of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §6. The MCP daemon (from [[Ticket 37 Deploy hud-mcp Daemon to Hetzner]]) listens on `127.0.0.1:7610`. `tailscale serve --bg https / http://127.0.0.1:7610` exposes it on the tailnet with Tailscale-managed TLS — no Caddy involvement, no public internet exposure.

Tailscale ACL design from the blueprint:
- Hetzner tagged `tag:hud-mcp`; MacBook (and future MacBook #2) tagged `tag:hermes-client`
- Only `:7610` is reachable from `hermes-client` nodes; SSH, web UI, and all other ports use separate rules
- ACL JSON committed to `ops/tailscale/acl.json` and applied in the Tailscale admin console

A reference doc `plan/reference/tailscale.md` is created here for the operator and future tickets that reference the tailnet URL.

## Acceptance Criteria

- [ ] `tailscale` installed on Hetzner via official Debian repo; `tailscale up` succeeds; node tagged `tag:hud-mcp`; MagicDNS resolves the node name
- [ ] `tailscale serve --bg https / http://127.0.0.1:7610` exposes the MCP daemon at `https://hud.<tailnet>.ts.net:7610`; Tailscale-managed TLS works end-to-end
- [ ] `https://hud.<tailnet>.ts.net:7610` reachable from operator's MacBook (tailnet peer) with valid bearer token → 200
- [ ] Same URL unreachable from a device off the tailnet (tested from iPhone on cellular)
- [ ] `ops/tailscale/acl.json` committed with `tag:hermes-client` → `tag:hud-mcp:7610` accept rule; applied in Tailscale admin console
- [ ] Tailscale ACL verified: `tag:hermes-client` cannot reach any port other than 7610 on the `tag:hud-mcp` node
- [ ] `plan/reference/tailscale.md` created documenting: tailnet name, node tags, ACL philosophy, and the tailnet MCP URL for use in downstream tickets

## Sub-tasks

- [ ] Install Tailscale: `curl -fsSL https://tailscale.com/install.sh | sh`; `tailscale up --ssh=false --hostname=hud`
- [ ] Tag node `tag:hud-mcp` in the Tailscale admin console; verify MagicDNS name resolves
- [ ] Validate tailnet path independent of daemon first: `nc -l 127.0.0.1 7610` + `tailscale serve` + `curl` from MacBook — confirms reachability before daemon traffic
- [ ] Point `tailscale serve` at real daemon; verify end-to-end with bearer token
- [ ] Write `ops/tailscale/acl.json`; apply in Tailscale admin console
- [ ] Test non-tailnet device cannot reach the URL (cellular test)
- [ ] Write `plan/reference/tailscale.md`
- [ ] Commit `ops/tailscale/acl.json`

## Open Questions

## Notes
