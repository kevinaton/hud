---
title: MCP Token Rotation Runbook
area: infra
created: 2026-06-11
updated: 2026-06-11
---

# MCP Token Rotation Runbook

Runbook for rotating bearer tokens that grant access to `hud-mcp.service`.
A fresh engineer with no prior context should be able to follow this dry-run
without guessing.

---

## Background

The MCP daemon authenticates callers via bearer tokens. Plaintext tokens are
stored only in the operator's password manager. The server stores argon2id
hashes in `/srv/hud/secrets/mcp-tokens.yaml` (mode 600, owner `hud`). No
plaintext token ever persists on the HUD server.

Authorization decisions (which tools a caller may invoke) are in
`/srv/hud/secrets/mcp-acl.yaml` (mode 600, owner `hud`).

The token store is loaded once at daemon startup. Any change to either file
requires a daemon restart to take effect.

---

## Current identities (as of 2026-06-11)

| Identity | Where used | Expires |
|---|---|---|
| `platform:hermes-gateway` | Server-side Hermes Docker container | 2026-09-07 |
| `platform:hermes-macbook-a` | MacBook #1 local Hermes via Tailscale | 2026-09-07 |
| `platform:spare-rotation-1` | Rotation spare — no ACL entry, deny-all | 2026-09-07 |

**Rotation deadline:** 2026-09-07. Rotate all active identities before this
date. Update the `expires:` field in `mcp-tokens.yaml` to the new 90-day
deadline after each rotation.

---

## Step 0 — Prerequisites

All steps run on the Hetzner server as the `hud` user unless stated otherwise.

The `hud` user has these NOPASSWD sudo permissions:

```
(ALL) NOPASSWD: /bin/systemctl restart hud-mcp.service
(ALL) NOPASSWD: /bin/systemctl start hud-mcp.service
(ALL) NOPASSWD: /bin/systemctl stop hud-mcp.service
(ALL) NOPASSWD: /bin/systemctl status hud-mcp.service
(ALL) NOPASSWD: /bin/systemctl reload hud-mcp.service
```

The argon2id hashing tool used here is `@node-rs/argon2` via the project's
local `node_modules`. The system `argon2` CLI is not installed. The `openssl`
CLI is available for token generation.

---

## Step 1 — Generate a new plaintext token

```bash
openssl rand -hex 32
```

Example output:
```
a3f9c2e1b4d07865fa924dc830e15b7f29a6d3c80e41f5b6279d0e8a3c914b2
```

Save this value to your password manager immediately (label it with the
identity name and date). It cannot be recovered from the server.

---

## Step 2 — Hash the token (argon2id)

Run from `/srv/hud/app/` as the `hud` user. The parameters
(`m=19456, t=2, p=1`) must match what the daemon uses.

```bash
node -e "
const { hash } = require('/srv/hud/app/packages/mcp-hud/node_modules/@node-rs/argon2');
hash('<PASTE_PLAINTEXT_TOKEN_HERE>', { memoryCost: 19456, timeCost: 2, parallelism: 1 })
  .then(h => console.log(h));
"
```

Example output (your salt and hash will differ):

```
$argon2id$v=19$m=19456,t=2,p=1$Epads4WyAFbqoLRkXRXdFg$WgFFy+WnWYjh8+RRZZUAY08Z/pQ+f6we9DpeYWlAxk4
```

Copy this full `$argon2id$...` string — you will paste it into
`mcp-tokens.yaml`.

---

## Step 3 — Rotating a server-side identity

This procedure uses `platform:hermes-gateway` as the example. Substitute the
actual identity name throughout.

### 3a. Add the new identity to mcp-tokens.yaml

Edit `/srv/hud/secrets/mcp-tokens.yaml` as `hud`. Add a new entry with a
`-v2` suffix (or increment the suffix if `-v2` already exists):

```yaml
  - identity: platform:hermes-gateway-v2
    tokenHash: "$argon2id$v=19$m=19456,t=2,p=1$<YOUR_HASH_HERE>"
    issued: "2026-06-11"
    expires: "2026-09-09"
    notes: "Server-side Hermes Docker container — rotation of hermes-gateway"
```

Do not remove the old entry yet. Both identities will briefly coexist.

### 3b. Add the new identity to mcp-acl.yaml

Edit `/srv/hud/secrets/mcp-acl.yaml` as `hud`. Copy the old identity's ACL
block and paste it with the new identity name:

```yaml
  platform:hermes-gateway-v2:
    allow:
      - cashflow.add
      - cashflow.list
      - cashflow.summary
      - cashflow.categories
    deny:
      - cashflow.edit
      - cashflow.delete
      - cashflow.createCategory
      - "vault.*"
      - "calendar.*"
```

### 3c. Validate the YAML files

```bash
cd /srv/hud/app && node --import tsx/esm scripts/validate-mcp-config.ts \
  --tokens /srv/hud/secrets/mcp-tokens.yaml \
  --acl    /srv/hud/secrets/mcp-acl.yaml
```

If this exits 0, the YAML is well-formed. Fix any errors before proceeding.

### 3d. Restart the MCP daemon

```bash
sudo systemctl restart hud-mcp.service
```

Confirm it came up cleanly:

```bash
sudo systemctl status hud-mcp.service
```

Look for `Active: active (running)` and no error lines in the journal output.

### 3e. Update the Hermes container's env file

Edit `/srv/hermes/data/.env` as root or agent-hermes. Update the
`MCP_BEARER_TOKEN` line to the new plaintext token:

```bash
sudo -u agent-hermes sed -i \
  "s|^MCP_BEARER_TOKEN=.*|MCP_BEARER_TOKEN=<NEW_PLAINTEXT_TOKEN>|" \
  /srv/hermes/data/.env
```

Or edit the file directly with your preferred editor.

### 3f. Restart the Hermes container

```bash
DOCKER_HOST=unix:///run/user/2013/docker.sock \
  docker compose -f /srv/hermes/docker/docker-compose.yml restart
```

Wait a few seconds for the container to come up, then check:

```bash
journalctl -t hermes --since "1 minute ago" | tail -20
```

### 3g. Verify the new token works

Run from a machine on the tailnet (MacBook or directly on the server):

```bash
MCP_TOKEN="<NEW_PLAINTEXT_TOKEN>" \
curl -s -X POST https://hud.tail5e5324.ts.net/mcp \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cashflow.list","arguments":{}}}' \
  | head -c 200
```

A successful response starts with `{"result":...}` or `{"jsonrpc":"2.0",...}`.
HTTP 401 means the token was not accepted — check that the hash in
`mcp-tokens.yaml` matches the plaintext and that the daemon restarted.

### 3h. Remove the old identity

Once the new token is confirmed working, remove the old identity from both
files:

`/srv/hud/secrets/mcp-tokens.yaml` — delete the `platform:hermes-gateway`
entry (keep `platform:hermes-gateway-v2`).

`/srv/hud/secrets/mcp-acl.yaml` — delete the `platform:hermes-gateway` block
(keep `platform:hermes-gateway-v2`).

### 3i. Final restart

```bash
sudo systemctl restart hud-mcp.service
sudo systemctl status hud-mcp.service
```

Verify the old token is now rejected:

```bash
MCP_TOKEN="<OLD_PLAINTEXT_TOKEN>" \
curl -s -o /dev/null -w "%{http_code}" -X POST https://hud.tail5e5324.ts.net/mcp \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cashflow.list","arguments":{}}}'
```

Expected: `401`. If you still get `200`, the daemon is serving stale config —
check that the restart succeeded and that you removed the correct entry.

### 3j. Clean up password manager

Delete the old plaintext token entry from your password manager. Add the new
one labeled `HUD MCP token — platform:hermes-gateway-v2 (active)`.

---

## Step 4 — Rotating the MacBook identity (hermes-macbook-a)

The server-side steps are identical to Step 3. The additional out-of-band step
is that the operator must also update their MacBook.

### 4a–4i. Server-side steps

Follow Step 3 exactly, substituting `platform:hermes-macbook-a` for
`platform:hermes-gateway`. There is no server-side container to update (the
MacBook connects from the outside via Tailscale).

### 4j. MacBook — update Hermes config (operator, out of band)

On the MacBook, the token is set in Hermes' local config. Find the
`HUD_MCP_TOKEN` value and update it to the new plaintext token.

If using Hermes Desktop: Settings → MCP Servers → HUD → Bearer token field.

If using the CLI config file (typically `~/.hermes/config.yaml` or
`~/.hermes/.env`):

```bash
# On MacBook — find where the token is stored
grep -r "HUD_MCP_TOKEN\|MCP_BEARER" ~/.hermes/ 2>/dev/null
```

Update the token and restart Hermes Desktop or the local Hermes process.

### 4k. Verify from the MacBook

```bash
# On MacBook (must be on tailnet)
MCP_TOKEN="<NEW_PLAINTEXT_TOKEN>" \
curl -s -X POST https://hud.tail5e5324.ts.net/mcp \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cashflow.list","arguments":{}}}' \
  | head -c 200
```

---

## Step 5 — Adding a new device (MacBook #2 dry-run)

This section demonstrates that onboarding a second MacBook requires only YAML
edits, a new token, and a Tailscale-join. No code changes.

### 5a. Generate a token and hash

Follow Steps 1 and 2 to generate a plaintext token and its argon2id hash.

### 5b. Add the new identity to mcp-tokens.yaml

```yaml
  - identity: platform:hermes-macbook-b
    tokenHash: "$argon2id$v=19$m=19456,t=2,p=1$<YOUR_HASH>"
    issued: "YYYY-MM-DD"
    expires: "YYYY-MM-DD"
    notes: "MacBook #2 local Hermes via Tailscale tailnet"
```

### 5c. Add the ACL entry to mcp-acl.yaml

Uncomment the template block that is already present in `mcp-acl.yaml`:

```yaml
  platform:hermes-macbook-b:
    allow:
      - cashflow.add
      - cashflow.list
      - cashflow.summary
      - cashflow.categories
    deny:
      - cashflow.edit
      - cashflow.delete
      - cashflow.createCategory
      - "vault.*"
      - "calendar.*"
```

### 5d. Restart the daemon

```bash
sudo systemctl restart hud-mcp.service
sudo systemctl status hud-mcp.service
```

### 5e. Install and configure Hermes on MacBook #2

On MacBook #2, install Hermes and configure it to point at the MCP daemon:

```yaml
# ~/.hermes/config.yaml (or equivalent location)
mcp_servers:
  hud:
    url: "https://hud.tail5e5324.ts.net/"
    headers:
      Authorization: "Bearer <NEW_PLAINTEXT_TOKEN>"
```

The environment variable form (if Hermes reads `.env`):

```
HUD_MCP_TOKEN=<NEW_PLAINTEXT_TOKEN>
```

### 5f. Join MacBook #2 to the tailnet

In the Tailscale admin console (tailscale.com/admin/machines), assign the
tag `tag:hermes-client` to MacBook #2. No ACL change is needed — the existing
ACL already grants `tag:hermes-client` access to `tag:hud-mcp:7610`.

Verify connectivity from MacBook #2:

```bash
tailscale ping hud
```

### 5g. Verify end-to-end

```bash
# On MacBook #2 (on tailnet)
MCP_TOKEN="<NEW_PLAINTEXT_TOKEN>" \
curl -s -X POST https://hud.tail5e5324.ts.net/mcp \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cashflow.list","arguments":{}}}' \
  | head -c 200
```

---

## Step 6 — Promoting spare-rotation-1

The spare slot is designed for zero-downtime rotation: the spare token exists
and is authenticated before it has any permissions, so you can pre-position a
new credential before rotating an in-use one.

### 6a. Use the spare to replace an outgoing identity

When rotating (say) `platform:hermes-gateway`:

1. Edit `mcp-tokens.yaml`: change the `identity` of `spare-rotation-1` to
   `platform:hermes-gateway-v2`.
2. Edit `mcp-acl.yaml`: add `platform:hermes-gateway-v2` with the same allow/deny
   list as `platform:hermes-gateway` (see Step 3b).
3. Restart the daemon (Step 3d).
4. Update the Hermes container `.env` with the spare's plaintext token (which
   you saved when the spare was provisioned).
5. Restart the Hermes container (Step 3f).
6. Verify (Step 3g).
7. Remove `platform:hermes-gateway` from both files (Step 3h).
8. Final restart (Step 3i).

### 6b. Generate a new spare

After the old spare slot has been consumed, generate a fresh spare so the
pattern survives the next rotation:

```bash
# Step 1: generate plaintext
openssl rand -hex 32
# Save to password manager as "HUD MCP spare-rotation-2"

# Step 2: hash it
node -e "
const { hash } = require('/srv/hud/app/packages/mcp-hud/node_modules/@node-rs/argon2');
hash('<NEW_SPARE_PLAINTEXT>', { memoryCost: 19456, timeCost: 2, parallelism: 1 })
  .then(h => console.log(h));
"
```

Add to `mcp-tokens.yaml`:

```yaml
  - identity: platform:spare-rotation-2
    tokenHash: "$argon2id$v=19$m=19456,t=2,p=1$<HASH>"
    issued: "YYYY-MM-DD"
    expires: "YYYY-MM-DD"
    notes: "Rotation spare — no ACL entry, deny-all until promoted"
```

Do NOT add an entry in `mcp-acl.yaml`. Restart the daemon.

---

## Expiry schedule

Current expiry: **2026-09-07**.

Set a calendar reminder for **2026-08-24** (two weeks before expiry). On that
date, rotate all active identities and update their `expires:` field to 90
days from the rotation date.

To find the next expiry date:

```bash
grep "expires:" /srv/hud/secrets/mcp-tokens.yaml
```

After rotation, update the `expires:` field in each new entry:

```yaml
    expires: "2026-12-07"   # 90 days from rotation date
```

---

## Quick reference — file locations

| File | Location | Permissions |
|---|---|---|
| Token hashes | `/srv/hud/secrets/mcp-tokens.yaml` | 600, owner `hud` |
| ACL rules | `/srv/hud/secrets/mcp-acl.yaml` | 600, owner `hud` |
| Hermes container env | `/srv/hermes/data/.env` | 600, owner `agent-hermes` |
| Hermes compose file | `/srv/hermes/docker/docker-compose.yml` | — |
| MCP daemon unit | `hud-mcp.service` (systemd) | — |
| Argon2 library | `/srv/hud/app/packages/mcp-hud/node_modules/@node-rs/argon2/` | — |
| YAML validator | `/srv/hud/app/scripts/validate-mcp-config.ts` | — |

## Quick reference — commands

```bash
# Generate token
openssl rand -hex 32

# Hash token (run from /srv/hud/app/)
node -e "const {hash}=require('/srv/hud/app/packages/mcp-hud/node_modules/@node-rs/argon2'); hash('<TOKEN>',{memoryCost:19456,timeCost:2,parallelism:1}).then(h=>console.log(h));"

# Validate config files
cd /srv/hud/app && node --import tsx/esm scripts/validate-mcp-config.ts \
  --tokens /srv/hud/secrets/mcp-tokens.yaml \
  --acl    /srv/hud/secrets/mcp-acl.yaml

# Restart daemon
sudo systemctl restart hud-mcp.service
sudo systemctl status hud-mcp.service

# Test a token
curl -s -X POST https://hud.tail5e5324.ts.net/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cashflow.list","arguments":{}}}' \
  | head -c 200

# Restart Hermes container
DOCKER_HOST=unix:///run/user/2013/docker.sock \
  docker compose -f /srv/hermes/docker/docker-compose.yml restart

# Check current token expiry
grep "expires:" /srv/hud/secrets/mcp-tokens.yaml
```
