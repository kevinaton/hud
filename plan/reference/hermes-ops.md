# Hermes Agent — Ops Runbook

Hetzner server, tenant `agent-hermes` (UID 2013), slice `hermes.slice`.
Docker image: `nousresearch/hermes-agent` (rootless Docker under `agent-hermes`).

---

## Quick reference

| URL | Port | Purpose |
|-----|------|---------|
| `https://hermes.kevinaton.com` | 9119 | Hermes dashboard (CF Access ON) |
| `https://hermes-api.kevinaton.com` | 8642 | Gateway API (CF Access OFF — bearer auth) |
| `https://hud.tail5e5324.ts.net/mcp` | 443 | MCP daemon (Tailscale only, bearer auth) |

---

## First-time setup

```bash
# From repo root on local MacBook:
./scripts/setup-hermes.sh          # copies compose file, validates .env, probes tailnet
# Review checklist output, fill in .env keys, then proceed to Ticket 45.
```

---

## Model configuration

The default model for `opencode-zen` provider is `kimi-k2.5` (disabled).
Set the correct model in `/srv/hermes/data/config.yaml`:

```yaml
provider: opencode-zen
model: opencode-zen/big-pickle
```

To update without editing the file directly:
```bash
hermes config set model opencode-zen/big-pickle
# or via docker exec:
DOCKER_HOST=unix:///run/user/2013/docker.sock \
  docker exec -it hermes hermes config set model opencode-zen/big-pickle
```

---

## Secrets — /srv/hermes/data/.env

Mode 0600, owner `agent-hermes`. Never committed to git.

| Key | Description |
|-----|-------------|
| `API_SERVER_KEY` | Hermes gateway bearer token. Strong random secret (≥32 chars). Set in Hermes Desktop and any client that calls the API. |
| `MCP_BEARER_TOKEN` | Plaintext bearer token for `platform:hermes-gateway` identity. Must match an argon2id hash in `/srv/hud/secrets/mcp-tokens.yaml`. |

Create the file:
```bash
sudo -u agent-hermes bash -c '
  touch /srv/hermes/data/.env
  chmod 0600 /srv/hermes/data/.env
  echo "API_SERVER_KEY=$(openssl rand -hex 32)" >> /srv/hermes/data/.env
  echo "MCP_BEARER_TOKEN=<paste-plaintext-hermes-gateway-token>" >> /srv/hermes/data/.env
'
```

---

## Starting the container

```bash
# As root (runs via agent-hermes's rootless Docker socket):
DOCKER_HOST=unix:///run/user/2013/docker.sock \
  docker compose -f /srv/hermes/docker/docker-compose.yml up -d
```

Or as `agent-hermes` directly:
```bash
su -s /bin/bash agent-hermes -c '
  export XDG_RUNTIME_DIR=/run/user/2013
  export DOCKER_HOST=unix:///run/user/2013/docker.sock
  docker compose -f /srv/hermes/docker/docker-compose.yml up -d
'
```

---

## Day-2 operations

### Status
```bash
DOCKER_HOST=unix:///run/user/2013/docker.sock docker ps
systemctl --user --machine=agent-hermes@.host status docker
```

### Logs
```bash
# Tail live logs (journald driver):
journalctl -t hermes -f

# Or via Docker:
DOCKER_HOST=unix:///run/user/2013/docker.sock \
  docker logs -f hermes --tail 100
```

### Restart
```bash
DOCKER_HOST=unix:///run/user/2013/docker.sock \
  docker compose -f /srv/hermes/docker/docker-compose.yml restart
```

### Stop
```bash
DOCKER_HOST=unix:///run/user/2013/docker.sock \
  docker compose -f /srv/hermes/docker/docker-compose.yml down
```

### OOM response
Hermes includes Playwright/Chromium which can spike to 3–4G. If the container
is OOM-killed (`docker inspect hermes | grep OOM`):

1. Check available memory: `free -h`
2. Check slice limits: `systemctl status hermes.slice`
3. If a one-off spike: `docker compose up -d` to restart
4. If recurring: reduce Chromium concurrency in Hermes config or upgrade server

---

## Updating the image (OQ-6 — digest pinning)

The image is pinned to `sha256:` digest in `docker/hermes/docker-compose.yml`.
To update:

```bash
# 1. Pull latest on server
DOCKER_HOST=unix:///run/user/2013/docker.sock docker pull nousresearch/hermes-agent:latest

# 2. Get new digest
DOCKER_HOST=unix:///run/user/2013/docker.sock \
  docker inspect nousresearch/hermes-agent:latest \
  --format='{{index .RepoDigests 0}}'

# 3. Update docker/hermes/docker-compose.yml in repo with new digest
# 4. ./scripts/setup-hermes.sh   (re-deploys compose file)
# 5. docker compose up -d        (rolling restart)
# 6. Commit the digest change: git commit -m "chore(hermes): pin image to <new-digest>"
```

Never run `:latest` in production — digest pinning is non-negotiable.

---

## Networking (OQ-2 — bridge vs host)

**Current mode: bridge** (default per blueprint §4).

The container uses bridge networking with `extra_hosts: hud-mcp.tailnet:100.72.129.67`.
This maps the alias `hud-mcp.tailnet` to the host's Tailscale IP inside the container,
allowing Hermes to reach the MCP daemon at `https://hud-mcp.tailnet/mcp` via
`tailscale serve` on the host.

The probe in `scripts/setup-hermes.sh` Step 4 verifies this path is working before
container start. If the probe fails:

**Fallback to host networking:**
1. Edit `/srv/hermes/docker/docker-compose.yml`:
   - Remove `extra_hosts`, `ports` sections
   - Add `network_mode: host`
   - Change `MCP_SERVER_URL` to `http://127.0.0.1:7610/mcp`
2. Update this section to document the change.
3. Redeploy: `./scripts/setup-hermes.sh && docker compose up -d`

Reason bridge mode is preferred: host networking exposes all host ports inside
the container, eliminating the port-isolation benefit of rootless Docker.

---

## Token rotation

### Hermes gateway token (MCP bearer)
1. Generate new token: `openssl rand -hex 32`
2. Save to password manager as "HUD MCP token — hermes-gateway (new)"
3. Hash: see `packages/mcp-hud/scripts/hash-token.js` or `@node-rs/argon2`
4. Update `/srv/hud/secrets/mcp-tokens.yaml` with new hash
5. Update `/srv/hermes/data/.env` → `MCP_BEARER_TOKEN=<new-plaintext>`
6. `systemctl restart hud-mcp.service`
7. `docker compose restart` (picks up new .env)
8. Delete old password manager entry

### API_SERVER_KEY rotation
1. Generate: `openssl rand -hex 32`
2. Update `/srv/hermes/data/.env`
3. Update Hermes Desktop settings with new key
4. `docker compose restart`

---

## AppArmor profile

Profile: `hermes-agent` (enforce mode). Applied via `security_opt` in compose file.
Denies reads to `/srv/hud/`, `/srv/portfolio/`, `/root/`, `/home/`, `/etc/sudoers*`.

Verify: `sudo aa-status | grep hermes-agent`
Reload after profile changes: `sudo apparmor_parser -r /etc/apparmor.d/hermes-agent`
