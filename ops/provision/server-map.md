# Server Map — HUD + Portfolio

Last updated: 2026-06-08

## Tenants

### hud
- Root:    /srv/hud
- Owner:   hud:hud (UID 2001)
- Agents:  run directly as hud (UID 2001) — agent-hud retired 2026-06-08, isolation judged unnecessary overhead for a single-operator setup
- Slice:   hud.slice (80% CPU, 4G RAM)
- Web:     hud-web.service on 127.0.0.1:3000
- DB:      /srv/hud/data/hud.db (SQLite + Litestream → R2)
- Vault:   /srv/hud/vault (Phase 2)
- Logs:    /srv/hud/logs/ + journalctl -u hud-web
- Domain:  hud.kevinaton.com (CF Access required)
- Read   : hud may read everything under /srv/hud
- Write  : hud may write under /srv/hud/{vault,data}/...
- Forbid : hud must not read /srv/portfolio (perms enforce)

### portfolio
- Root:    /srv/portfolio
- Owner:   portfolio:portfolio (UID 2002)
- Agents:  agent-portfolio (UID 2012, sandboxed, no-shell) — Phase 5
- Slice:   portfolio.slice (40% CPU, 2G RAM)
- Web:     portfolio-web.service on 127.0.0.1:3001
- Static:  /srv/portfolio/public/ (Caddy reads)
- Domain:  kevinaton.com (public)

## Shared
- Caddy:        /srv/shared/caddy/Caddyfile (root-owned)
- Cloudflared:  /srv/shared/cloudflared/config.yml
- Agent CLIs:   claude, gemini, opencode — directly on hud's $PATH at /usr/bin/
- Discovery:    /opt/agents/bin/{hud-where,hud-status,hud-tail,hud-map,hud-tenants}
- Litestream:   /var/lib/litestream/<tenant>/

## Operational conventions
- Every tenant has the same subdir shape: app/ data/ secrets/ logs/ runtime/
- Logs are JSON (pino), one line per event, stdout -> journald
- Secrets are sops-encrypted in git, decrypted to /srv/<tenant>/secrets/.env at boot
- Never write outside your tenant root. Use `hud-where <tenant>` to find paths.

## Discovery commands
- hud-where <tenant>          # prints tenant paths
- hud-status                  # systemctl status of all hud-*/portfolio-* units
- hud-tail <tenant>           # journalctl -fu <tenant>-web
- hud-map                     # opens this file in $PAGER
- hud-tenants                 # lists /etc/hud/tenants/
