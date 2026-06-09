#!/usr/bin/env bash
# scripts/setup-hermes.sh
#
# Hermes provisioning helper — local steps only.
# Server-side provisioning (user creation, slice, AppArmor, rootless Docker)
# is handled in Ticket 42 and is executed directly on the Hetzner host via SSH.
#
# This script handles the steps that can be driven from the local monorepo:
#   1. Deploy Andrea persona skills to /srv/hermes/data/skills/andrea/
#
# The script is idempotent: running it multiple times produces the same result.
# All destructive operations are gated behind explicit flags.
#
# Usage:
#   ./scripts/setup-hermes.sh [--dry-run]
#
# Requires:
#   - SSH access to the Hetzner host as a user with sudo
#   - The HERMES_HOST env var set (or passed as HERMES_HOST=... ./scripts/setup-hermes.sh)
#     Default: hud (resolved via ~/.ssh/config or /etc/hosts)
#
# Coordination note (Ticket 42):
#   Ticket 42 will add docker-compose deployment, .env validation, and container
#   start steps to this script. The skill rsync step below is the Ticket 44
#   contribution; do not remove it when merging Ticket 42 additions.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

HERMES_HOST="${HERMES_HOST:-hud}"
DRY_RUN=false

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--dry-run]" >&2
      exit 1
      ;;
  esac
done

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] No changes will be made."
fi

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

log() {
  echo "[setup-hermes] $*"
}

run_remote() {
  local cmd="$*"
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] ssh ${HERMES_HOST}: ${cmd}"
  else
    ssh "${HERMES_HOST}" "${cmd}"
  fi
}

# ---------------------------------------------------------------------------
# Step 1: Deploy Andrea persona skills
#
# Rsyncs apps/hermes-policy/skills/andrea/ into /srv/hermes/data/skills/andrea/
# on the server with ownership agent-hermes:agent-hermes.
#
# Idempotent: rsync only transfers changed files; ownership is set with chown
# after transfer. Running twice is safe.
# ---------------------------------------------------------------------------

SKILLS_SRC="${REPO_ROOT}/apps/hermes-policy/skills/andrea/"
SKILLS_DEST="/srv/hermes/data/skills/andrea/"

log "Step 1: Syncing Andrea skills to ${HERMES_HOST}:${SKILLS_DEST}"

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] rsync -az --delete '${SKILLS_SRC}' '${HERMES_HOST}:${SKILLS_DEST}'"
  echo "[dry-run] ssh ${HERMES_HOST}: chown -R agent-hermes:agent-hermes '${SKILLS_DEST}'"
else
  # Ensure the destination directory exists on the remote host before rsync.
  # Using sudo to create it in case it does not yet exist under /srv/hermes/.
  run_remote "sudo mkdir -p '${SKILLS_DEST}'"

  # Rsync: archive mode, delete removed files, compress in transit.
  rsync -az --delete \
    "${SKILLS_SRC}" \
    "${HERMES_HOST}:${SKILLS_DEST}"

  # Fix ownership after rsync (rsync runs as the SSH user, not agent-hermes).
  run_remote "sudo chown -R agent-hermes:agent-hermes '${SKILLS_DEST}'"

  log "Skills synced and ownership set to agent-hermes:agent-hermes."
fi

# ---------------------------------------------------------------------------
# Step 2: Deploy docker-compose.yml to server
#
# Copies docker/hermes/docker-compose.yml → /srv/hermes/docker/docker-compose.yml
# on the server. Ownership is set to agent-hermes:agent-hermes.
# ---------------------------------------------------------------------------

COMPOSE_SRC="${REPO_ROOT}/docker/hermes/docker-compose.yml"
COMPOSE_DEST="/srv/hermes/docker/docker-compose.yml"

log "Step 2: Deploying docker-compose.yml to ${HERMES_HOST}:${COMPOSE_DEST}"

if [[ ! -f "${COMPOSE_SRC}" ]]; then
  echo "ERROR: ${COMPOSE_SRC} not found. Cannot deploy compose file." >&2
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] rsync '${COMPOSE_SRC}' '${HERMES_HOST}:${COMPOSE_DEST}'"
  echo "[dry-run] ssh ${HERMES_HOST}: chown agent-hermes:agent-hermes '${COMPOSE_DEST}'"
else
  rsync -az "${COMPOSE_SRC}" "${HERMES_HOST}:${COMPOSE_DEST}"
  run_remote "sudo chown agent-hermes:agent-hermes '${COMPOSE_DEST}'"
  log "docker-compose.yml deployed."
fi

# ---------------------------------------------------------------------------
# Step 3: Validate required keys in /srv/hermes/data/.env
#
# Checks that the required keys exist in the .env file on the server.
# Does NOT check values — secrets are the operator's responsibility.
#
# Required keys:
#   API_SERVER_KEY   — Hermes gateway bearer token (strong random secret)
#   MCP_BEARER_TOKEN — plaintext token for platform:hermes-gateway identity
# ---------------------------------------------------------------------------

REQUIRED_KEYS=("API_SERVER_KEY" "MCP_BEARER_TOKEN")
ENV_FILE_REMOTE="/srv/hermes/data/.env"

log "Step 3: Validating .env on ${HERMES_HOST}"

ENV_MISSING=()
if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would validate keys in ${ENV_FILE_REMOTE}: ${REQUIRED_KEYS[*]}"
else
  if ! run_remote "test -f '${ENV_FILE_REMOTE}'" 2>/dev/null; then
    log "WARNING: ${ENV_FILE_REMOTE} does not exist on server."
    log "         Create it (mode 0600) before starting the container:"
    log "         sudo -u agent-hermes touch ${ENV_FILE_REMOTE}"
    log "         sudo -u agent-hermes chmod 0600 ${ENV_FILE_REMOTE}"
    for key in "${REQUIRED_KEYS[@]}"; do
      ENV_MISSING+=("${key}")
    done
  else
    for key in "${REQUIRED_KEYS[@]}"; do
      if run_remote "grep -q '^${key}=' '${ENV_FILE_REMOTE}'" 2>/dev/null; then
        log "  [OK] ${key} present"
      else
        log "  [MISSING] ${key} not found in .env"
        ENV_MISSING+=("${key}")
      fi
    done
  fi

  if [[ ${#ENV_MISSING[@]} -gt 0 ]]; then
    log "WARNING: Missing .env keys: ${ENV_MISSING[*]}"
    log "         Add them to ${ENV_FILE_REMOTE} before running Ticket 45."
    log "         See plan/reference/hermes-ops.md for descriptions."
  fi
fi

# ---------------------------------------------------------------------------
# Step 4: Tailscale reachability probe (OQ-2 — bridge vs host networking)
#
# Runs a throwaway Docker container in bridge mode and probes the MCP daemon
# at the Tailscale IP. 401 = reachable (auth required); anything else = fail.
# On failure, prints fallback instructions for host networking.
# ---------------------------------------------------------------------------

TAILNET_IP="100.72.129.67"
MCP_URL="https://hud-mcp.tailnet/mcp"

log "Step 4: Tailscale bridge-networking probe"

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would run bridge probe container against ${MCP_URL} via ${TAILNET_IP}"
else
  PROBE_HTTP=$(run_remote "
    docker run --rm \
      --add-host hud-mcp.tailnet:${TAILNET_IP} \
      --network bridge \
      curlimages/curl:latest \
      curl -sk -o /dev/null -w '%{http_code}' --max-time 5 '${MCP_URL}' 2>/dev/null
  " 2>/dev/null) || PROBE_HTTP="000"

  if [[ "${PROBE_HTTP}" == "401" || "${PROBE_HTTP}" == "200" || "${PROBE_HTTP}" == "400" ]]; then
    log "  [OK] Bridge container reached MCP daemon (HTTP ${PROBE_HTTP}) — bridge mode confirmed"
  else
    log "  [WARN] Bridge probe returned HTTP ${PROBE_HTTP}"
    log ""
    log "  ================================================================"
    log "  FALLBACK: Switch to host networking"
    log "  ================================================================"
    log "  Edit /srv/hermes/docker/docker-compose.yml:"
    log "    - Remove: extra_hosts, ports sections"
    log "    - Add:    network_mode: host"
    log "    - Change MCP_SERVER_URL to: http://127.0.0.1:7610/mcp"
    log "  Then update plan/reference/hermes-ops.md OQ-2 section."
    log "  ================================================================"
  fi
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

log "setup-hermes.sh complete."
if [ "$DRY_RUN" = true ]; then
  log "Re-run without --dry-run to apply changes."
fi

log ""
log "Pre-start checklist (before Ticket 45 / 'docker compose up -d'):"
log "  [ ] /srv/hermes/data/.env exists (mode 0600) with all required keys"
log "  [ ] API_SERVER_KEY set to a strong random secret (≥32 chars)"
log "  [ ] MCP_BEARER_TOKEN set to the hermes-gateway plaintext token"
log "  [ ] hermes-agent AppArmor profile enforcing"
log "  [ ] hermes.slice active"
log "  [ ] Rootless Docker active for agent-hermes"
log "  See plan/reference/hermes-ops.md for full day-2 operations."
