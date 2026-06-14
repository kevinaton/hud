#!/usr/bin/env bash
# deploy.sh — Safe production deploy for HUD.
#
# Usage (run from repo root as a user with sudo for systemctl):
#   bash scripts/deploy.sh
#
# What this does:
#   1. Pulls latest git changes
#   2. Installs dependencies (frozen lockfile)
#   3. Runs DB migrations
#   4. Builds Next.js with memory cap + low CPU priority
#      - NODE_OPTIONS=--max-old-space-size=1536  → V8 GC stays aggressive;
#        heap won't balloon past ~1.5GB
#      - nice -n 19  → lowest CPU priority; hud-web and Hermes stay responsive
#        during the build
#   5. Restarts hud-web ONLY if the build succeeded
#
# IMPORTANT: Run `sudo bash scripts/add-swap.sh` once before using this if
# the server has no swap. Without swap, even a capped build can OOM-kill
# running services on 3.7GB RAM.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { echo "[deploy] $*"; }
die() { echo "[deploy] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. Pre-flight checks
# ---------------------------------------------------------------------------
log "Starting deploy — $(date '+%Y-%m-%d %H:%M:%S')"

# Warn if swap is still missing
SWAP_TOTAL=$(free -b | awk '/^Swap/ {print $2}')
if [ "$SWAP_TOTAL" -eq 0 ]; then
  echo ""
  echo "  WARNING: No swap detected. The build may OOM-kill running services."
  echo "  Run once as root: sudo bash scripts/add-swap.sh"
  echo ""
  read -r -p "  Continue anyway? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || die "Aborted."
fi

AVAILABLE_MEM_MB=$(free -m | awk '/^Mem/ {print $7}')
log "Available RAM before build: ${AVAILABLE_MEM_MB}MB"

# ---------------------------------------------------------------------------
# 1. Pull latest changes
# ---------------------------------------------------------------------------
log "Pulling latest changes..."
git pull --ff-only

# ---------------------------------------------------------------------------
# 2. Install dependencies (frozen — never silently update lockfile in prod)
# ---------------------------------------------------------------------------
log "Installing dependencies..."
pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# 3. DB migrations (before build so schema is current)
# ---------------------------------------------------------------------------
log "Running DB migrations..."
pnpm db:migrate

# ---------------------------------------------------------------------------
# 4. Build — memory-capped and low-priority
#
#   --max-old-space-size=1536  caps V8 old-gen heap at 1.5GB.
#   nice -n 19                 lowest possible CPU scheduling priority.
#   Both together mean: build uses what it needs but yields to live processes.
# ---------------------------------------------------------------------------
log "Building (memory cap 1536MB, nice 19) — this takes ~30–60s..."

BUILD_START=$(date +%s)

NODE_OPTIONS="--max-old-space-size=1536" \
  nice -n 19 \
  pnpm build

BUILD_END=$(date +%s)
log "Build completed in $((BUILD_END - BUILD_START))s"

# ---------------------------------------------------------------------------
# 5. Restart hud-web (only reached if build succeeded — set -e handles this)
# ---------------------------------------------------------------------------
log "Restarting hud-web..."
sudo systemctl restart hud-web

# Give it a moment then verify it came up
sleep 3
if systemctl is-active --quiet hud-web; then
  log "hud-web is active."
else
  die "hud-web failed to start after restart. Check: journalctl -u hud-web -n 50"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
log "Deploy complete — $(date '+%Y-%m-%d %H:%M:%S')"
log "Build took $((BUILD_END - BUILD_START))s. Service is up."
