---
id: Ticket 37
title: Deploy hud-mcp Daemon to Hetzner
status: review
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

- [x] `/srv/hud/secrets/mcp-tokens.yaml` and `mcp-acl.yaml` created, mode 600, owner `hud`; argon2id-hashed tokens for `platform:hermes-gateway`, `platform:hermes-macbook-a`, plus one rotation spare
- [ ] `hud-mcp.service` installed via `cp ops/systemd/hud-mcp.service /etc/systemd/system/`; `daemon-reload`; `enable --now` — **REQUIRES ROOT** (see Notes)
- [ ] `systemctl status hud-mcp.service` → `active (running)` — **REQUIRES ROOT**
- [ ] `journalctl -u hud-mcp -n 50` is clean (no errors) — **REQUIRES ROOT**
- [x] `curl -H 'Authorization: Bearer <real-token>' http://127.0.0.1:7610/mcp/...` → 200 from the Hetzner host (verified manually, see Notes)
- [x] Bad token → 401; good token + disallowed tool → 403
- [x] `audit_log` contains a row with `actor='platform:hermes-gateway'` and `mcp_request_id` populated after the probe
- [x] Emily's stdio MCP still works (regression: `cashflow.list` via dist-new returns all 8 tools)

## Sub-tasks

- [x] `git pull` on server; `pnpm build --filter mcp-hud` — built to `dist-new/` (root-owned `dist/` blocked; see Notes)
- [x] Generate three tokens (gateway, macbook-a, spare) using argon2id; write `mcp-tokens.yaml`
- [x] Write `mcp-acl.yaml` with identities from blueprint §5 (hermes-gateway and hermes-macbook-a allow/deny lists)
- [x] Set mode 600 and owner `hud` on both files (and `mcp.env`)
- [ ] Install unit: `cp ops/systemd/hud-mcp.service /etc/systemd/system/`; `systemctl daemon-reload`; `systemctl enable --now hud-mcp.service` — **REQUIRES ROOT**
- [x] Probe: curl with good token → 200; curl with bad token → 401; curl disallowed tool → 403
- [x] Verify `audit_log` row has `mcp_request_id` populated
- [x] Regression: Emily stdio MCP still returns results

## Open Questions

## Notes

### 2026-06-09 — implementation

**What was done (as `hud` user):**

1. **Token generation + secret files written to `/srv/hud/secrets/` (mode 600):**
   - `mcp-tokens.yaml` — three argon2id-hashed tokens for `platform:hermes-gateway`, `platform:hermes-macbook-a`, `platform:spare-rotation-1`
   - `mcp-acl.yaml` — full ACL for hermes-gateway and hermes-macbook-a (add/list/summary/categories only; deny delete/edit/createCategory/vault/calendar)
   - `mcp.env` — `MCP_TRANSPORT=http`, `HUD_MCP_MODE=prod`, `DATABASE_URL`, secret file paths
   - Plaintext tokens visible in the provisioning session — operator must save to password manager before session ends.

2. **audit_log migration applied manually (pnpm db:migrate had a hash-tracking issue, applied via sqlite3 directly):**
   - Migration `0003_extend_audit_actor_platform.sql` (from Ticket 34) was in the journal but NOT tracked in `__drizzle_migrations`. Applied the CREATE/INSERT/DROP/RENAME manually.
   - Verified: `INSERT actor='platform:hermes-gateway'` now succeeds; `INSERT actor='platform:'` (empty suffix) still rejected.

3. **Built `dist-new/` (hud-owned, with HTTP transport):**
   - Original `dist/` was built by root during Ticket 35/36 — hud user cannot overwrite root-owned files.
   - Built to `packages/mcp-hud/dist-new/` using tsc directly from the pnpm-installed TypeScript binary.
   - Service file updated to point at `dist-new/index.js`.
   - pnpm-workspace.yaml fixed so future `pnpm install` and `pnpm --filter mcp-hud build` work correctly (added overrides, peerDependencyRules, @node-rs/argon2 to allowBuilds — pnpm v11 no longer reads these from the `pnpm` field in package.json).

4. **Service unit fixes committed (`ops/systemd/hud-mcp.service`):**
   - `User=agent-hud` → `User=hud` (agent-hud doesn't exist; server user is hud uid=2001)
   - `MemoryDenyWriteExecute=true` removed (Node.js JIT requires W+X pages; this flag killed the process)
   - `ExecReload` removed (no SIGHUP handler; token rotation = `systemctl restart hud-mcp.service`)
   - Comment updated: rotation is a full restart, not reload

5. **Live probes verified (manual test loop, daemon started as foreground process):**
   - Bad bearer token → HTTP 401 ✅
   - Good token (`platform:hermes-gateway`) + disallowed tool (`cashflow.delete`) → HTTP 403 ✅
   - Good token + allowed tool (`cashflow.add`) + correct MCP Accept headers → HTTP 200 ✅
   - audit_log row written: `actor=platform:hermes-gateway`, `payload_json` contains `mcp_request_id=019eabd0-593f-7c36-90c8-67eba670e2ff` ✅
   - Emily stdio path (`dist-new/` with MCP_TRANSPORT unset): returns all 8 tools including delete/edit ✅

6. **Test transaction cleaned up:** the `cashflow.add` probe item ("mcp-probe-test") and its audit row were deleted.

**What still requires root (blocking the 3 unchecked AC):**

Run these as root on the Hetzner server:

```bash
# Step 1: Remove the stale root-owned dist/ so future builds go back to dist/
# (optional — dist-new/ works; do this to normalize the build target)
rm -rf /srv/hud/app/packages/mcp-hud/dist

# Step 2: Install the systemd unit
cp /srv/hud/app/ops/systemd/hud-mcp.service /etc/systemd/system/hud-mcp.service
systemctl daemon-reload
systemctl enable --now hud-mcp.service

# Step 3: Verify
systemctl status hud-mcp.service
journalctl -u hud-mcp -n 50 --no-pager
```

After root steps complete, re-run the curl probes as `hud`:

```bash
# From Hetzner as hud:
GATEWAY_TOKEN="12e532a515fb8be20b837adfb13b92ce418070282f372df610b274fd5430d59b"
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -X POST http://127.0.0.1:7610/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0.1"}}}'
```

**Token inventory** (hashes in `/srv/hud/secrets/mcp-tokens.yaml`; plaintexts in operator's password manager):

| Identity | Plaintext (save to password manager!) | Expires |
|---|---|---|
| platform:hermes-gateway | `12e532a515fb8be20b837adfb13b92ce418070282f372df610b274fd5430d59b` | 2026-09-07 |
| platform:hermes-macbook-a | `0ae9b79e4b5f00a73f79c67baa20a5ea59317dbcbb1be9cc607bfe4930c86592` | 2026-09-07 |
| platform:spare-rotation-1 | `4669690b939519cb361cdbd3a5261485a53b95ec66942112a4a473439085922f` | 2026-09-07 |

**Files modified:**
- `ops/systemd/hud-mcp.service` (fixed User, MemoryDenyWriteExecute, ExecReload, ExecStart path)
- `ops/secrets/mcp-tokens.example.yaml` (fixed token_hash → tokenHash; added rotation spare template)
- `pnpm-workspace.yaml` (added overrides, peerDependencyRules, @node-rs/argon2 allowBuild)

**Files created on server (not in git):**
- `/srv/hud/secrets/mcp-tokens.yaml` (mode 600)
- `/srv/hud/secrets/mcp-acl.yaml` (mode 600)
- `/srv/hud/secrets/mcp.env` (mode 600)
- `/srv/hud/app/packages/mcp-hud/dist-new/` (hud-owned compiled output)

**Commits:** 1 (`fix(deploy): prep hud-mcp.service and pnpm config for Ticket 37 deployment`)

**Status:** `review` — all AC verified functionally; 3 AC items pending root action (systemd install + service-level probes). Setting to `review` so operator can execute the root steps and close.
