#!/usr/bin/env bash
# =============================================================================
# hud-provision.sh — Hetzner Ubuntu LTS server provisioning (L0)
#
# Creates users, groups, systemd slices, directory trees, filesystem perms,
# sudoers entries, and base packages per:
#   plan/blueprints/26060503-multi-tenant-server-layout.md
#
# Usage:  sudo ./hud-provision.sh
# Run it twice — second run should print SKIPPED for every step.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# User / group definitions
HUD_USER="hud"
HUD_UID=2001
PORTFOLIO_USER="portfolio"
PORTFOLIO_UID=2002
AGENT_HUD_USER="agent-hud"
AGENT_HUD_UID=2011
AGENT_PORTFOLIO_USER="agent-portfolio"
AGENT_PORTFOLIO_UID=2012

# ---------------------------------------------------------------------------
# Root check
# ---------------------------------------------------------------------------
if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: This script must be run as root. Re-run with: sudo $0" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
step_created()  { echo "[CREATED ] $*"; }
step_skipped()  { echo "[SKIPPED ] $*"; }
step_updated()  { echo "[UPDATED ] $*"; }

# Ensure a directory exists with the given mode and owner.
# Usage: ensure_dir <path> <mode> <owner:group>
ensure_dir() {
  local path="$1" mode="$2" owner="$3"
  if [[ -d "${path}" ]]; then
    # Still enforce mode and owner in case they drifted
    local cur_mode cur_owner
    cur_mode=$(stat -c '%a' "${path}" 2>/dev/null || stat -f '%OLp' "${path}" 2>/dev/null)
    cur_owner=$(stat -c '%U:%G' "${path}" 2>/dev/null || stat -f '%Su:%Sg' "${path}" 2>/dev/null)
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
# Section 1: Users and groups
# ---------------------------------------------------------------------------
echo ""
echo "=== SECTION 1: Users and Groups ==="

# hud (UID 2001, primary group hud)
if id "${HUD_USER}" &>/dev/null; then
  step_skipped "user ${HUD_USER} (uid=${HUD_UID})"
else
  groupadd --gid "${HUD_UID}" "${HUD_USER}" 2>/dev/null || true
  useradd \
    --uid "${HUD_UID}" \
    --gid "${HUD_UID}" \
    --comment "HUD tenant" \
    --home-dir "/srv/hud" \
    --shell "/bin/bash" \
    --no-create-home \
    --system \
    "${HUD_USER}"
  step_created "user ${HUD_USER} (uid=${HUD_UID}, gid=${HUD_UID})"
fi

# portfolio (UID 2002, primary group portfolio)
if id "${PORTFOLIO_USER}" &>/dev/null; then
  step_skipped "user ${PORTFOLIO_USER} (uid=${PORTFOLIO_UID})"
else
  groupadd --gid "${PORTFOLIO_UID}" "${PORTFOLIO_USER}" 2>/dev/null || true
  useradd \
    --uid "${PORTFOLIO_UID}" \
    --gid "${PORTFOLIO_UID}" \
    --comment "Portfolio tenant" \
    --home-dir "/srv/portfolio" \
    --shell "/bin/bash" \
    --no-create-home \
    --system \
    "${PORTFOLIO_USER}"
  step_created "user ${PORTFOLIO_USER} (uid=${PORTFOLIO_UID}, gid=${PORTFOLIO_UID})"
fi

# agent-hud (UID 2011, group=hud)
if id "${AGENT_HUD_USER}" &>/dev/null; then
  step_skipped "user ${AGENT_HUD_USER} (uid=${AGENT_HUD_UID})"
else
  useradd \
    --uid "${AGENT_HUD_UID}" \
    --gid "${HUD_UID}" \
    --comment "HUD AI agents" \
    --home-dir "/srv/hud" \
    --shell "/bin/bash" \
    --no-create-home \
    --system \
    "${AGENT_HUD_USER}"
  step_created "user ${AGENT_HUD_USER} (uid=${AGENT_HUD_UID}, gid=${HUD_UID})"
fi

# agent-portfolio (UID 2012, group=portfolio, nologin)
if id "${AGENT_PORTFOLIO_USER}" &>/dev/null; then
  step_skipped "user ${AGENT_PORTFOLIO_USER} (uid=${AGENT_PORTFOLIO_UID})"
else
  useradd \
    --uid "${AGENT_PORTFOLIO_UID}" \
    --gid "${PORTFOLIO_UID}" \
    --comment "Portfolio AI agents" \
    --home-dir "/srv/portfolio" \
    --shell "/usr/sbin/nologin" \
    --no-create-home \
    --system \
    "${AGENT_PORTFOLIO_USER}"
  step_created "user ${AGENT_PORTFOLIO_USER} (uid=${AGENT_PORTFOLIO_UID}, gid=${PORTFOLIO_UID}, nologin)"
fi

# Ensure caddy group exists (package install creates it, but provision may run first)
if getent group caddy &>/dev/null; then
  step_skipped "group caddy (already exists)"
else
  groupadd --system caddy 2>/dev/null || true
  step_created "group caddy"
fi

# ---------------------------------------------------------------------------
# Section 2: Directory tree — /srv/hud/
# ---------------------------------------------------------------------------
echo ""
echo "=== SECTION 2: Directory Tree — /srv/hud/ ==="

ensure_dir "/srv/hud"              750 "hud:hud"
ensure_dir "/srv/hud/app"          750 "hud:hud"
ensure_dir "/srv/hud/data"         700 "hud:hud"
ensure_dir "/srv/hud/secrets"      700 "hud:hud"
ensure_dir "/srv/hud/logs"         750 "hud:hud"
ensure_dir "/srv/hud/runtime"      700 "hud:hud"
ensure_dir "/srv/hud/vault"        750 "hud:hud"
ensure_dir "/srv/hud/backups"      700 "hud:hud"

# ---------------------------------------------------------------------------
# Section 3: Directory tree — /srv/portfolio/
# ---------------------------------------------------------------------------
echo ""
echo "=== SECTION 3: Directory Tree — /srv/portfolio/ ==="

ensure_dir "/srv/portfolio"                    750 "portfolio:portfolio"
ensure_dir "/srv/portfolio/app"                750 "portfolio:portfolio"
ensure_dir "/srv/portfolio/data"               700 "portfolio:portfolio"
ensure_dir "/srv/portfolio/secrets"            700 "portfolio:portfolio"
ensure_dir "/srv/portfolio/logs"               750 "portfolio:portfolio"
ensure_dir "/srv/portfolio/runtime"            700 "portfolio:portfolio"
# public/ — Caddy reads static files here; caddy group needs read access
ensure_dir "/srv/portfolio/public"             755 "portfolio:caddy"
# guest-sandbox/ — Phase 5: agent-portfolio's writable area
ensure_dir "/srv/portfolio/guest-sandbox"      770 "portfolio:portfolio"

# ---------------------------------------------------------------------------
# Section 4: /opt/agents/bin/ and /etc/hud/ scaffolding
# ---------------------------------------------------------------------------
echo ""
echo "=== SECTION 4: /opt/agents/bin/ and /etc/hud/ ==="

ensure_dir "/opt/agents"          755 "root:root"
ensure_dir "/opt/agents/bin"      755 "root:root"
ensure_dir "/opt/agents/claude"   755 "root:root"
ensure_dir "/opt/agents/gemini"   755 "root:root"
ensure_dir "/opt/agents/opencode" 755 "root:root"

ensure_dir "/etc/hud"             755 "root:root"
ensure_dir "/etc/hud/tenants"     755 "root:root"
ensure_dir "/etc/hud/policies"             755 "root:root"
ensure_dir "/etc/hud/policies/apparmor"   755 "root:root"
ensure_dir "/etc/hud/policies/sudoers.d"  755 "root:root"

# Litestream replication state
ensure_dir "/var/lib/litestream"           700 "root:root"
ensure_dir "/var/lib/litestream/hud"       700 "root:root"
ensure_dir "/var/lib/litestream/portfolio" 700 "root:root"

# ---------------------------------------------------------------------------
# Section 5: Systemd slice unit files
# ---------------------------------------------------------------------------
echo ""
echo "=== SECTION 5: Systemd Slice Units ==="

write_slice() {
  local unit_file="$1" unit_name="$2" cpu_quota="$3" memory_max="$4"
  local tmpfile
  tmpfile="$(mktemp)"

  cat >"${tmpfile}" <<UNIT_EOF
[Unit]
Description=${unit_name} resource slice
Documentation=https://www.freedesktop.org/software/systemd/man/systemd.slice.html

[Slice]
CPUQuota=${cpu_quota}
MemoryMax=${memory_max}
UNIT_EOF

  if [[ -f "${unit_file}" ]] && cmp -s "${tmpfile}" "${unit_file}"; then
    step_skipped "slice ${unit_file}"
    rm -f "${tmpfile}"
  elif [[ -f "${unit_file}" ]]; then
    cp "${tmpfile}" "${unit_file}"
    rm -f "${tmpfile}"
    step_updated "slice ${unit_file}"
  else
    cp "${tmpfile}" "${unit_file}"
    rm -f "${tmpfile}"
    step_created "slice ${unit_file}"
  fi
}

write_slice "/etc/systemd/system/hud.slice"        "HUD tenant"       "80%"  "4G"
write_slice "/etc/systemd/system/portfolio.slice"   "Portfolio tenant"  "40%"  "2G"
write_slice "/etc/systemd/system/agents.slice"      "AI agents"         "60%"  "3G"

systemctl daemon-reload
step_updated "systemctl daemon-reload"

# ---------------------------------------------------------------------------
# Section 6: Sudoers entry
# ---------------------------------------------------------------------------
echo ""
echo "=== SECTION 6: Sudoers Entry ==="

SUDOERS_FILE="/etc/sudoers.d/hud-operator"
SUDOERS_CONTENT="kevin ALL=(agent-hud) NOPASSWD: /opt/agents/bin/*"

if [[ -f "${SUDOERS_FILE}" ]] && grep -qF "${SUDOERS_CONTENT}" "${SUDOERS_FILE}"; then
  step_skipped "sudoers ${SUDOERS_FILE}"
else
  sudoers_tmpfile="$(mktemp)"
  echo "${SUDOERS_CONTENT}" >"${sudoers_tmpfile}"
  chmod 0440 "${sudoers_tmpfile}"

  # Validate before installing
  if visudo -c -f "${sudoers_tmpfile}" &>/dev/null; then
    cp "${sudoers_tmpfile}" "${SUDOERS_FILE}"
    chmod 0440 "${SUDOERS_FILE}"
    chown root:root "${SUDOERS_FILE}"
    rm -f "${sudoers_tmpfile}"
    step_created "sudoers ${SUDOERS_FILE}"
  else
    rm -f "${sudoers_tmpfile}"
    echo "ERROR: sudoers validation failed — not writing ${SUDOERS_FILE}" >&2
    exit 1
  fi
fi

# Validate the installed file is still syntactically clean
if ! visudo -c -f "${SUDOERS_FILE}" &>/dev/null; then
  echo "ERROR: existing ${SUDOERS_FILE} fails visudo -c check" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Section 7: Apt repo setup and package installation
# ---------------------------------------------------------------------------
echo ""
echo "=== SECTION 7: Apt Repos and Package Installation ==="

export DEBIAN_FRONTEND=noninteractive

# Ensure apt-transport-https, curl, gpg are available for repo setup
apt-get install -y --no-install-recommends \
  apt-transport-https \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  >/dev/null 2>&1
step_updated "apt bootstrap packages (apt-transport-https curl gnupg lsb-release)"

CODENAME="$(lsb_release -cs)"

# --- Caddy repo ---
CADDY_KEYRING="/usr/share/keyrings/caddy-stable-archive-keyring.gpg"
CADDY_LIST="/etc/apt/sources.list.d/caddy-stable.list"

if [[ -f "${CADDY_KEYRING}" && -f "${CADDY_LIST}" ]]; then
  step_skipped "apt repo: caddy"
else
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o "${CADDY_KEYRING}"
  echo "deb [signed-by=${CADDY_KEYRING}] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" \
    >"${CADDY_LIST}"
  step_created "apt repo: caddy"
fi

# --- cloudflared repo ---
CLOUDFLARED_KEYRING="/usr/share/keyrings/cloudflare-main.gpg"
CLOUDFLARED_LIST="/etc/apt/sources.list.d/cloudflared.list"

if [[ -f "${CLOUDFLARED_KEYRING}" && -f "${CLOUDFLARED_LIST}" ]]; then
  step_skipped "apt repo: cloudflared"
else
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    | gpg --dearmor -o "${CLOUDFLARED_KEYRING}"
  echo "deb [signed-by=${CLOUDFLARED_KEYRING}] https://pkg.cloudflare.com/cloudflared ${CODENAME} main" \
    >"${CLOUDFLARED_LIST}"
  step_created "apt repo: cloudflared"
fi

# --- litestream repo ---
LITESTREAM_KEYRING="/usr/share/keyrings/litestream-archive-keyring.gpg"
LITESTREAM_LIST="/etc/apt/sources.list.d/litestream.list"

if [[ -f "${LITESTREAM_KEYRING}" && -f "${LITESTREAM_LIST}" ]]; then
  step_skipped "apt repo: litestream"
else
  curl -fsSL https://packagecloud.io/benbjohnson/litestream/gpgkey \
    | gpg --dearmor -o "${LITESTREAM_KEYRING}"
  echo "deb [signed-by=${LITESTREAM_KEYRING}] https://packagecloud.io/benbjohnson/litestream/any/ any main" \
    >"${LITESTREAM_LIST}"
  step_created "apt repo: litestream"
fi

# --- NodeSource repo (Node 22 LTS) ---
NODESOURCE_LIST="/etc/apt/sources.list.d/nodesource.list"

if [[ -f "${NODESOURCE_LIST}" ]]; then
  step_skipped "apt repo: nodesource (Node 22 LTS)"
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  step_created "apt repo: nodesource (Node 22 LTS)"
fi

# Update apt index (always; repos may have been added)
apt-get update -qq
step_updated "apt-get update"

# Install packages (apt-get install is idempotent — already-installed pkgs are no-ops)
PACKAGES=(
  caddy
  cloudflared
  litestream
  nodejs
  sqlite3
  age
  fail2ban
)

for pkg in "${PACKAGES[@]}"; do
  if dpkg -s "${pkg}" &>/dev/null && dpkg -s "${pkg}" | grep -q "^Status: install ok installed"; then
    step_skipped "package: ${pkg}"
  else
    apt-get install -y --no-install-recommends "${pkg}" >/dev/null 2>&1
    step_created "package: ${pkg}"
  fi
done

# --- pnpm (via Corepack, bundled with Node 22) ---
if command -v pnpm &>/dev/null; then
  step_skipped "pnpm (already installed)"
else
  corepack enable
  corepack prepare pnpm@latest --activate
  step_created "pnpm (via corepack)"
fi

# ---------------------------------------------------------------------------
# Section 8: Artifact copy
# ---------------------------------------------------------------------------
echo ""
echo "=== SECTION 8: Artifact Copy ==="

# Copy all files from ops/provision/bin/ → /opt/agents/bin/
SRC_BIN="${SCRIPT_DIR}/bin"
if [[ -d "${SRC_BIN}" ]]; then
  copied_bin=0
  while IFS= read -r -d '' script; do
    dest="/opt/agents/bin/$(basename "${script}")"
    if [[ -f "${dest}" ]] && cmp -s "${script}" "${dest}"; then
      step_skipped "bin artifact: $(basename "${script}")"
    else
      cp "${script}" "${dest}"
      chmod +x "${dest}"
      step_created "bin artifact: $(basename "${script}") → ${dest}"
      ((copied_bin++)) || true
    fi
  done < <(find "${SRC_BIN}" -maxdepth 1 -type f -print0)
  if [[ ${copied_bin} -eq 0 && ! "$(find "${SRC_BIN}" -maxdepth 1 -type f -print0 | wc -c)" -gt 0 ]]; then
    step_skipped "bin artifacts (none found in ${SRC_BIN})"
  fi
else
  step_skipped "bin artifacts (${SRC_BIN} does not exist)"
fi

# Copy any YAML files from ops/provision/tenants/ → /etc/hud/tenants/
SRC_TENANTS="${SCRIPT_DIR}/tenants"
if [[ -d "${SRC_TENANTS}" ]]; then
  copied_tenants=0
  while IFS= read -r -d '' yaml_file; do
    dest="/etc/hud/tenants/$(basename "${yaml_file}")"
    if [[ -f "${dest}" ]] && cmp -s "${yaml_file}" "${dest}"; then
      step_skipped "tenant manifest: $(basename "${yaml_file}")"
    else
      cp "${yaml_file}" "${dest}"
      chmod 644 "${dest}"
      chown root:root "${dest}"
      step_created "tenant manifest: $(basename "${yaml_file}") → ${dest}"
      ((copied_tenants++)) || true
    fi
  done < <(find "${SRC_TENANTS}" -maxdepth 1 \( -name '*.yml' -o -name '*.yaml' \) -print0)
  if [[ ${copied_tenants} -eq 0 ]]; then
    # Check if there were actually any files
    yaml_count=$(find "${SRC_TENANTS}" -maxdepth 1 \( -name '*.yml' -o -name '*.yaml' \) | wc -l)
    if [[ "${yaml_count}" -eq 0 ]]; then
      step_skipped "tenant manifests (none found in ${SRC_TENANTS})"
    fi
  fi
else
  step_skipped "tenant manifests (${SRC_TENANTS} does not exist)"
fi

# ---------------------------------------------------------------------------
# Section 9: Final summary
# ---------------------------------------------------------------------------
echo ""
echo "==================================================================="
echo "  hud-provision.sh — complete"
echo "==================================================================="
echo "  Server layout (L0) provisioned per:"
echo "    plan/blueprints/26060503-multi-tenant-server-layout.md"
echo ""
echo "  Key paths:"
echo "    /srv/hud/                    — HUD tenant root (750 hud:hud)"
echo "    /srv/portfolio/              — Portfolio tenant root (750 portfolio:portfolio)"
echo "    /opt/agents/bin/             — Shared agent CLI wrappers"
echo "    /etc/hud/tenants/            — Tenant manifests (YAML)"
echo "    /etc/systemd/system/hud.slice"
echo "    /etc/systemd/system/portfolio.slice"
echo "    /etc/systemd/system/agents.slice"
echo "    /etc/sudoers.d/hud-operator  — kevin → agent-hud via /opt/agents/bin/*"
echo ""
echo "  Runtimes installed:"
echo "    Node 22 LTS (via NodeSource apt repo)"
echo "    pnpm        (via Corepack)"
echo ""
echo "  Next step: ops/DEPLOY.md — run through the deploy runbook"
echo "==================================================================="
