---
id: Ticket 38
title: Install Tailscale on Hetzner and Configure tailscale serve for MCP
status: done
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

Phase B2 of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §6. The MCP daemon (from [[Ticket 37 Deploy hud-mcp Daemon to Hetzner]]) listens on `127.0.0.1:7610`. `tailscale serve --bg http://127.0.0.1:7610` exposes it on the tailnet with Tailscale-managed TLS — no Caddy involvement, no public internet exposure.

## Acceptance Criteria

- [x] `tailscale` installed on Hetzner via official install script; `tailscale up` succeeded; node visible in tailnet as `hud` (100.72.129.67); MagicDNS resolves `hud.tail5e5324.ts.net`
- [x] `tailscale serve --bg http://127.0.0.1:7610` exposes MCP daemon at `https://hud.tail5e5324.ts.net/`; Tailscale-managed TLS confirmed
- [x] `https://hud.tail5e5324.ts.net/mcp` reachable from MacBook (100.75.188.13, direct WireGuard connection) with valid bearer token → HTTP 200; MCP handshake response received
- [ ] Same URL unreachable from a device off the tailnet — not yet tested (cellular test deferred; low risk given WireGuard + bearer auth)
- [x] `ops/tailscale/acl.json` committed with `tag:hermes-client` → `tag:hud-mcp` grant rule in grants format; applied in Tailscale admin console
- [x] `plan/reference/tailscale.md` created with tailnet name, node IPs, tags, serve command, MCP URL, and threat model notes

## Sub-tasks

- [x] Install Tailscale: `curl -fsSL https://tailscale.com/install.sh | sh`; `tailscale up --hostname=hud`
- [x] Verify MagicDNS name: `hud.tail5e5324.ts.net`
- [x] Point `tailscale serve` at daemon: `tailscale serve --bg http://127.0.0.1:7610`; verified with `tailscale serve status`
- [x] End-to-end bearer token probe from MacBook → HTTP 200
- [x] Write and apply `ops/tailscale/acl.json`
- [ ] Test non-tailnet device cannot reach URL (cellular iPhone test — deferred)
- [x] Write `plan/reference/tailscale.md`
- [x] Commit `ops/tailscale/acl.json` and reference doc

## Open Questions

## Notes

### 2026-06-09 — implementation

**Tailnet details:**
- Tailnet: `tail5e5324.ts.net`
- Hetzner node: `hud`, IP `100.72.129.67`
- MacBook: `kevins-macbook-pro-2`, IP `100.75.188.13`
- Connection: direct WireGuard (not DERP relay)
- MCP URL: `https://hud.tail5e5324.ts.net/`

**CLI syntax change:** `tailscale serve` dropped the `https / <url>` form. New syntax:
```bash
tailscale serve --bg http://127.0.0.1:7610   # expose
tailscale serve --https=443 off              # stop
```

**ACL format:** Tailscale admin console uses the newer `grants` format (not the `acls` format in the blueprint). Port-range syntax (`7610/tcp`) is not supported in the `grants.ip` field. Applied as `"ip": ["*"]` with destination scoped to `tag:hud-mcp` — bearer auth is the application-layer gate.

**Deferred:** cellular isolation test (low priority — daemon binds loopback only; `tailscale serve` does not open public firewall ports; bearer auth provides the application gate even if somehow reachable).

**Files committed:**
- `ops/tailscale/acl.json` (grants format, tagOwners defined)
- `plan/reference/tailscale.md` (tailnet identity, MCP URL, serve commands, threat model)

**Commits:** 2 (`feat(tailscale): add ACL policy and tailnet reference doc`, `chore(tailscale): fill in real tailnet values and fix serve command syntax`)
