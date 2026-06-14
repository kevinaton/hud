#!/usr/bin/env bash
# add-swap.sh — One-time setup: create a 4GB swapfile on the server.
#
# Run once as root:
#   sudo bash scripts/add-swap.sh
#
# WHY: The server has 3.7GB RAM and zero swap. `pnpm build` (Next.js SWC +
# static generation) peaks at 1.5–2.5GB. With only ~1GB free at runtime,
# the Linux OOM killer fires and kills hud-web, Hermes, and any other process
# it finds. A 4GB swapfile gives the kernel a safety valve — the build slows
# down while swapping but nothing gets killed.
#
# This is idempotent: re-running when swap already exists is a no-op.

set -euo pipefail

SWAP_FILE="/swapfile"
SWAP_SIZE="4G"

if swapon --show | grep -q "$SWAP_FILE"; then
  echo "[add-swap] Swapfile $SWAP_FILE is already active — nothing to do."
  exit 0
fi

if [ -f "$SWAP_FILE" ]; then
  echo "[add-swap] $SWAP_FILE exists but is not active — activating."
else
  echo "[add-swap] Allocating $SWAP_SIZE swapfile at $SWAP_FILE ..."
  fallocate -l "$SWAP_SIZE" "$SWAP_FILE"
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE"
  echo "[add-swap] Swapfile created."
fi

swapon "$SWAP_FILE"
echo "[add-swap] Swap active:"
swapon --show

# Make permanent across reboots
if ! grep -q "$SWAP_FILE" /etc/fstab; then
  echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
  echo "[add-swap] Added to /etc/fstab (persists across reboots)."
else
  echo "[add-swap] Already in /etc/fstab."
fi

# Tune swappiness: default 60 is too aggressive for a low-RAM server.
# 10 = only use swap when RAM is nearly full (not pre-emptively).
sysctl vm.swappiness=10
if ! grep -q 'vm.swappiness' /etc/sysctl.conf; then
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  echo "[add-swap] vm.swappiness=10 written to /etc/sysctl.conf."
fi

echo "[add-swap] Done. Server now has $(free -h | awk '/^Swap/ {print $2}') of swap."
