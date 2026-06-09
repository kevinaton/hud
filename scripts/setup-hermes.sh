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
# Done
# ---------------------------------------------------------------------------

log "setup-hermes.sh complete."
if [ "$DRY_RUN" = true ]; then
  log "Re-run without --dry-run to apply changes."
fi
