#!/usr/bin/env bash
# =============================================================================
# provision-hermes.sh — Hermes tenant provisioning (server-side)
#
# Creates:
#   - hud-mcp-clients group
#   - agent-hermes user (UID 2013; UID 2012 is taken by agent-portfolio)
#   - /srv/hermes/{data,docker,logs}/ directory tree
#   - hermes.slice (systemd slice with CPU/memory/task caps)
#   - Rootless Docker for agent-hermes
#   - AppArmor hermes-agent profile (enforce mode)
#
# Usage:
#   sudo ./ops/provision/provision-hermes.sh
#
# Run from the repo root on the Hetzner server:
#   cd /srv/hud/app && sudo ./ops/provision/provision-hermes.sh
#
# Idempotent: safe to run twice.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# User/group definitions
HERMES_USER="agent-hermes"
HERMES_UID=2013             # NOTE: 2012 is taken by agent-portfolio
HERMES_HOME="/srv/hermes"
MCP_CLIENTS_GROUP="hud-mcp-clients"

# ---------------------------------------------------------------------------
# Root check
# ---------------------------------------------------------------------------
if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Must run as root. Re-run: sudo $0" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
step_created()  { echo "[CREATED ] $*"; }
step_skipped()  { echo "[SKIPPED ] $*"; }
step_updated()  { echo "[UPDATED ] $*"; }

ensure_group() {
  local name="$1" gid="$2"
  if getent group "${name}" > /dev/null 2>&1; then
    step_skipped "group ${name}"
  else
    groupadd --system --gid "${gid}" "${name}"
    step_created "group ${name} (gid=${gid})"
  fi
}

ensure_user() {
  local name="$1" uid="$2" home="$3" shell="$4" groups="$5"
  if id "${name}" > /dev/null 2>&1; then
    step_skipped "user ${name}"
    # Ensure supplementary group even if user exists
    if ! id -nG "${name}" | grep -qw "${MCP_CLIENTS_GROUP}"; then
      usermod -aG "${MCP_CLIENTS_GROUP}" "${name}"
      step_updated "user ${name}: added to ${MCP_CLIENTS_GROUP}"
    fi
  else
    useradd \
      --system \
      --uid "${uid}" \
      --home-dir "${home}" \
      --create-home \
      --shell "${shell}" \
      --groups "${groups}" \
      "${name}"
    step_created "user ${name} (uid=${uid} home=${home})"
  fi
}

ensure_dir() {
  local path="$1" mode="$2" owner="$3"
  if [[ -d "${path}" ]]; then
    local cur_mode cur_owner
    cur_mode=$(stat -c '%a' "${path}")
    cur_owner=$(stat -c '%U:%G' "${path}")
    if [[ "${cur_mode}" == "${mode}" && "${cur_owner}" == "${owner}" ]]; then
      step_skipped "dir ${path} (${mode} ${owner})"
    else
      chmod "${mode}" "${path}"
      chown "${owner}" "${path}"
      step_updated "dir ${path} → ${mode} ${owner}"
    fi
  else
    mkdir -p "${path}"
    chmod "${mode}" "${path}"
    chown "${owner}" "${path}"
    step_created "dir ${path} (${mode} ${owner})"
  fi
}

# ---------------------------------------------------------------------------
# 1. Groups
# ---------------------------------------------------------------------------
echo ""
echo "=== Groups ==="
ensure_group "${MCP_CLIENTS_GROUP}" 2020

# ---------------------------------------------------------------------------
# 2. User
# ---------------------------------------------------------------------------
echo ""
echo "=== Users ==="
ensure_user "${HERMES_USER}" "${HERMES_UID}" "${HERMES_HOME}" /bin/bash "${MCP_CLIENTS_GROUP}"

# ---------------------------------------------------------------------------
# 3. Directory layout
# ---------------------------------------------------------------------------
echo ""
echo "=== Directories ==="
ensure_dir "/srv/hermes"               750  "agent-hermes:agent-hermes"
ensure_dir "/srv/hermes/data"          700  "agent-hermes:agent-hermes"
ensure_dir "/srv/hermes/docker"        750  "agent-hermes:agent-hermes"
ensure_dir "/srv/hermes/logs"          750  "agent-hermes:agent-hermes"
ensure_dir "/srv/hermes/data/memories" 700  "agent-hermes:agent-hermes"
ensure_dir "/srv/hermes/data/skills"   700  "agent-hermes:agent-hermes"
ensure_dir "/srv/hermes/data/work"     700  "agent-hermes:agent-hermes"

# ---------------------------------------------------------------------------
# 4. systemd slice
# ---------------------------------------------------------------------------
echo ""
echo "=== systemd slice ==="
SLICE_SRC="${REPO_ROOT}/ops/systemd/hermes.slice"
SLICE_DST="/etc/systemd/system/hermes.slice"

if [[ ! -f "${SLICE_SRC}" ]]; then
  echo "ERROR: ${SLICE_SRC} not found. Run from repo root." >&2
  exit 1
fi

if [[ -f "${SLICE_DST}" ]] && diff -q "${SLICE_SRC}" "${SLICE_DST}" > /dev/null 2>&1; then
  step_skipped "hermes.slice (no changes)"
else
  cp "${SLICE_SRC}" "${SLICE_DST}"
  step_created "hermes.slice → ${SLICE_DST}"
fi

systemctl daemon-reload
if systemctl is-active hermes.slice > /dev/null 2>&1; then
  step_skipped "hermes.slice (already active)"
else
  systemctl start hermes.slice
  step_created "hermes.slice started"
fi

# ---------------------------------------------------------------------------
# 5. Install Docker CE (required for rootless Docker)
# ---------------------------------------------------------------------------
echo ""
echo "=== Docker CE ==="
if command -v docker > /dev/null 2>&1; then
  step_skipped "docker (already installed: $(docker --version))"
else
  echo "[INSTALL ] Docker CE + rootless extras..."
  # Official Docker install for Ubuntu
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin \
    docker-ce-rootless-extras \
    uidmap \
    dbus-user-session
  step_created "docker $(docker --version)"
fi

# Check rootless extras
if ! command -v dockerd-rootless-setuptool.sh > /dev/null 2>&1; then
  echo "ERROR: dockerd-rootless-setuptool.sh not found. Install docker-ce-rootless-extras." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 6. Rootless Docker for agent-hermes
# ---------------------------------------------------------------------------
echo ""
echo "=== Rootless Docker for ${HERMES_USER} ==="

# Enable linger so agent-hermes's user services survive logout
if loginctl show-user "${HERMES_USER}" 2>/dev/null | grep -q "Linger=yes"; then
  step_skipped "linger for ${HERMES_USER}"
else
  loginctl enable-linger "${HERMES_USER}"
  step_created "linger enabled for ${HERMES_USER}"
fi

# Set up rootless Docker as agent-hermes
HERMES_UID_ACTUAL=$(id -u "${HERMES_USER}")
XDG_RUNTIME_DIR_HERMES="/run/user/${HERMES_UID_ACTUAL}"

# Ensure XDG_RUNTIME_DIR exists (loginctl enable-linger creates it, but may need a moment)
if [[ ! -d "${XDG_RUNTIME_DIR_HERMES}" ]]; then
  mkdir -p "${XDG_RUNTIME_DIR_HERMES}"
  chmod 700 "${XDG_RUNTIME_DIR_HERMES}"
  chown "${HERMES_USER}:${HERMES_USER}" "${XDG_RUNTIME_DIR_HERMES}"
  step_created "${XDG_RUNTIME_DIR_HERMES}"
fi

# Run rootless Docker setup as agent-hermes
if systemctl --user --machine="${HERMES_USER}@.host" is-active docker > /dev/null 2>&1; then
  step_skipped "rootless Docker (already active)"
else
  echo "[INSTALL ] Setting up rootless Docker for ${HERMES_USER}..."
  su -s /bin/bash "${HERMES_USER}" -c "
    export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR_HERMES}
    export DBUS_SESSION_BUS_ADDRESS=unix:path=\${XDG_RUNTIME_DIR}/bus
    dockerd-rootless-setuptool.sh install --force
    systemctl --user enable --now docker
  " || {
    echo "[WARN] Rootless Docker setup failed. You may need to reboot or re-run after 'loginctl enable-linger' takes effect."
    echo "       Manual: su -s /bin/bash agent-hermes -c 'dockerd-rootless-setuptool.sh install'"
  }
fi

# ---------------------------------------------------------------------------
# 7. AppArmor profile
# ---------------------------------------------------------------------------
echo ""
echo "=== AppArmor profile ==="
AA_SRC="${REPO_ROOT}/ops/apparmor/hermes-agent"
AA_DST="/etc/apparmor.d/hermes-agent"

if [[ ! -f "${AA_SRC}" ]]; then
  echo "ERROR: ${AA_SRC} not found." >&2
  exit 1
fi

if [[ -f "${AA_DST}" ]] && diff -q "${AA_SRC}" "${AA_DST}" > /dev/null 2>&1; then
  step_skipped "hermes-agent AppArmor profile (no changes)"
else
  cp "${AA_SRC}" "${AA_DST}"
  step_created "hermes-agent AppArmor profile → ${AA_DST}"
fi

apparmor_parser -r "${AA_DST}"
step_updated "hermes-agent profile loaded (enforce mode)"

# ---------------------------------------------------------------------------
# 8. Verification summary
# ---------------------------------------------------------------------------
echo ""
echo "==================================================================="
echo "Hermes tenant provisioning complete. Verification:"
echo ""
echo "  id agent-hermes"
id agent-hermes
echo ""
echo "  ls -la /srv/hermes/"
ls -la /srv/hermes/
echo ""
echo "  systemctl status hermes.slice --no-pager"
systemctl status hermes.slice --no-pager -l | head -10
echo ""
echo "  aa-status | grep hermes-agent"
aa-status 2>/dev/null | grep hermes-agent || echo "  (not found in aa-status)"
echo ""
echo "  Rootless Docker:"
systemctl --user --machine="agent-hermes@.host" status docker --no-pager 2>/dev/null | head -5 \
  || echo "  (run: systemctl --user --machine=agent-hermes@.host status docker)"
echo "==================================================================="
