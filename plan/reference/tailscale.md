---
title: Tailscale — HUD tailnet reference
area: infra
created: 2026-06-09
updated: 2026-06-09
tailnet: tail5e5324.ts.net
---

# Tailscale — HUD tailnet reference

## Tailnet identity

| Field | Value |
|---|---|
| Tailnet name | `tail5e5324.ts.net` |
| Hetzner node hostname | `hud` |
| Hetzner MagicDNS name | `hud.tail5e5324.ts.net` |
| Hetzner Tailscale IP | `100.72.129.67` |
| Hetzner node tag | `tag:hud-mcp` |
| MacBook #1 tag | `tag:hermes-client` |

## MCP daemon URL (use in downstream tickets)

```
https://hud.tail5e5324.ts.net/
```

Port 7610 is served via `tailscale serve` — TLS is Tailscale-managed (Let's Encrypt via tailnet CA). No Caddy, no public internet.

In Hermes config (`config.yaml`) this becomes:

```yaml
mcp_servers:
  hud:
    url: "https://hud.tail5e5324.ts.net/"
    headers:
      Authorization: "Bearer ${HUD_MCP_TOKEN}"
```

## Node tags and ACL

ACL source of truth: `ops/tailscale/acl.json` — paste into tailscale.com/admin/acls to apply.

| Tag | Assigned to | Can reach |
|---|---|---|
| `tag:hud-mcp` | Hetzner | — |
| `tag:hermes-client` | MacBook #1 (and future MacBook #2) | `tag:hud-mcp:7610` only |
| *(operator personal devices)* | `autogroup:member` | `*:*` |

**To add MacBook #2:** assign `tag:hermes-client` in the Tailscale admin console — no ACL edit required.

## `tailscale serve` configuration

The MCP daemon binds to `127.0.0.1:7610`. `tailscale serve` proxies the tailnet-facing HTTPS endpoint to it:

```bash
tailscale serve --bg http://127.0.0.1:7610
```

To inspect the current serve config:

```bash
tailscale serve status
```

To stop (if needed for debugging):

```bash
tailscale serve --https=443 off
```

`tailscale serve` config survives reboots — it is stored in the Tailscale daemon state, not a systemd unit.

## Token rotation impact

Token rotation (`/srv/hud/secrets/mcp-tokens.yaml` edit + `systemctl restart hud-mcp.service`) does **not** affect Tailscale. The tailnet path is always up; authentication is at the application layer (bearer token).

## Threat model notes

- WireGuard end-to-end encryption between tailnet peers — no plaintext on the wire even without TLS.
- `tailscale serve` adds Tailscale-managed TLS on top — defence in depth.
- Port 7610 is unreachable from the public internet (daemon binds loopback only; `tailscale serve` does not open firewall ports).
- Tailscale account compromise → attacker could add a node to the tailnet. Mitigation: Tailscale SSO + MFA; reauth interval ≤ 90 days; monitor new-device-join alerts.

## Useful commands

```bash
tailscale status          # show peers and their state
tailscale ping hud        # latency to the hud node (from MacBook)
tailscale serve status    # show active serve proxies
tailscale netcheck        # DERP relay quality and NAT type
```
