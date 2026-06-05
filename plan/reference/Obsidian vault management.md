> [!warning] Status (2026-06-05) — iPhone WebDAV path deferred
> Per `blueprints/adr/ADR-26060501-vault-client-model.md`, the iPhone Obsidian client is **deferred** until the need is proven. For Phases 0–4 of the HUD, the only human-driven vault client is **MacBook native Obsidian via Syncthing**. The browser client (**Nexus**, a tab inside the HUD dashboard) is the second writer and ships in the **last** phase of the HUD roadmap.
>
> The Caddy WebDAV + Remotely Save + Cloudflare Service Token sections below are **not provisioned**. They are preserved as the reference implementation for whenever iPhone is revived.
>
> **Active during Phases 0–4:** Role · Vault Contents · Memory rule · MacBook / Syncthing · GitHub backup · Security Notes · Backup table.
> **Deferred:** iPhone / Caddy WebDAV · Remotely Save plugin · Cloudflare Access Service Token · iPhone sync workflow.

## Role

Obsidian vault (folder of markdown files) is the Knowledge layer of the HUD. It stores research, notes, project plans, and any long-form content with backlinks or graph value. The vault lives on the Hetzner server as the source of truth, with multi-device access via **Syncthing (MacBook)**. iPhone access via **Caddy WebDAV + Remotely Save plugin** is documented below but currently deferred (see banner above).

> Architecture decided in `plan/blueprints/26060402-obsidian-iphone-sync-webdav.md` (supersedes `26060401`).
> Client model revised in `plan/blueprints/adr/ADR-26060501-vault-client-model.md` (iPhone deferred; Nexus = last phase).

## Vault Contents

| Content | Example |
|---|---|
| Research notes | `research/llm-providers-2026.md` |
| Daily journal | `journal/2026-06-04.md` |
| Project plans | `projects/command-center/plan.md` |
| Decisions | `decisions/adr-001-vault-sync.md` |
| Monthly reports | `finance/monthly/2026-05.md` |
| Kanban card bodies | `kanban/*.md` (titles + IDs go in SQLite) |

**Rule:** *"Will I revisit this as a story or as a number?"* — story → vault, number → SQLite.

## Sync Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Hetzner Server                                                  │
│  /vault (source of truth, filesystem)                            │
│       │                                                          │
│       ├─── Syncthing (daemon) ◄──────────► MacBook              │
│       │                                     (Obsidian native)    │
│       │                                                          │
│       ├─── Caddy (caddy-webdav module) ◄──► iPhone              │
│       │     vault.kevinaton.com              (Obsidian + Remotely│
│       │     [Cloudflare Access SSO+MFA]        Save plugin)      │
│       │                                                          │
│       └─── git cron (15 min) ───► GitHub private repo            │
│                                   (off-site backup)              │
└──────────────────────────────────────────────────────────────────┘
```

Both clients run **real Obsidian** with full plugins, graph, and backlinks. Both write to the same `/vault` filesystem. No bespoke editor, no Docker, no paid services.

### MacBook — Syncthing
- Syncthing desktop app installed on MacBook.
- Syncs bidirectionally with server `/vault` in real-time.
- Obsidian opens vault locally — full plugin/graph/backlinks experience.
- No iCloud, no third-party sync service.

### iPhone — Caddy WebDAV + Remotely Save
- Real Obsidian iOS app, installed from the App Store.
- **Remotely Save** community plugin configured against `https://vault.kevinaton.com/` (WebDAV).
- Sync is **manual**: tap **Pull** on app open → edit → tap **Push** before closing. Same ergonomic class as opening Termius to run `claude`.
- Conflict policy: last-writer-wins with `.conflict-<timestamp>.md` sibling files — resolved by hand in Obsidian (expect < 5/month for solo use).
- Cloudflare Access (SSO+MFA) in front; Caddy basic-auth as second factor inside the tunnel.
- `/vault` on Hetzner is canonical — iPhone writes go straight to the filesystem.

### GitHub — Off-site Backup
- 15-min cron on server: `git add -A && git commit && git push origin main`.
- GitHub private repo is the off-site backup of record.
- Not used as an iOS bridge anymore (iPhone goes through WebDAV directly).

## Why This Approach

| Approach | Verdict (2026) |
|---|---|
| **Caddy WebDAV + Remotely Save** *(current)* | ✅ Zero cost, zero new daemons, real Obsidian on both devices, `/vault` stays canonical |
| Obsidian Sync (official) | ❌ $4–10/mo — defeats the purpose of self-hosting |
| iCloud sync | ❌ Fragile, opaque conflicts, breaks Syncthing+`/vault` model |
| Syncthing on iOS | ❌ No official iOS app |
| Browser-based vault viewer | ❌ Loses real Obsidian (no plugins/graph); custom code to maintain |
| LiveSync + CouchDB | ◐ Real-time chunk-merge, no Docker required (native `apt`), ~150 MB RAM — **upgrade path** if manual sync ever stops being acceptable. See blueprint `26060401`. |
| Remotely Save → Cloudflare R2 | ◐ Works, but shifts source of truth off Hetzner into a third-party bucket — undercuts the "use the server we already pay for" principle |
| Working Copy / GitSync (iOS) | ❌ Paid, and Obsidian-git on iOS is community-documented as flaky |
| Nextcloud | ❌ Heavy LAMP stack, over-engineered |

Core principles:
- **Free.** No subscription services.
- **Self-hosted.** Hetzner box is the whole point — don't push state into third-party data planes when avoidable.
- **`/vault` is canonical.** Everything (Syncthing, WebDAV, GitHub) reads/writes the same filesystem. No DB-as-source-of-truth, no bucket-as-source-of-truth.
- **Manual sync on iPhone is acceptable.** Tap Pull → edit → tap Push.

## Ops Reference

### Key Paths

| Path | Purpose |
|---|---|
| `/vault/` | Root vault folder on server (source of truth) |
| `~/.config/syncthing/` | Syncthing config |
| `/var/lib/syncthing/` | Syncthing data folder |
| `/etc/caddy/Caddyfile` | Caddy config (includes WebDAV block) |
| `/var/log/caddy/vault-access.log` | WebDAV access log (JSON) |

### Syncthing (MacBook ↔ Server)

```bash
# Install on server
sudo apt install syncthing

# Bind GUI to localhost only
# Edit ~/.config/syncthing/config.xml:
# <gui enabled="true" tls="true" address="127.0.0.1:8384">

# Enable as user systemd service
systemctl --user enable syncthing.service
systemctl --user start syncthing.service

# Pair with MacBook by exchanging device IDs in both UIs
# Share /vault folder; set folder type to "Send & Receive"
```

### Caddy WebDAV (iPhone ↔ Server)

Caddy must be built with the [`caddy-webdav`](https://github.com/mholt/caddy-webdav) module:

```bash
# One-time build (or use a prebuilt binary with webdav baked in)
xcaddy build --with github.com/mholt/caddy-webdav

# Verify
caddy list-modules | grep webdav
```

Caddyfile site block:

```caddy
vault.kevinaton.com {
    # Second factor inside the CF Access tunnel
    basic_auth /* {
        kevin {env.VAULT_WEBDAV_HASH}
    }

    handle {
        root * /vault
        webdav
    }

    encode zstd gzip

    # Rate limit + body cap as DoS guardrails
    request_body {
        max_size 50MB
    }

    log {
        output file /var/log/caddy/vault-access.log
        format json
    }
}
```

Filesystem permissions:

```bash
# Caddy user owns vault for writes; group shared with syncthing
sudo chown -R caddy:syncthing /vault
sudo chmod -R 0750 /vault
```

Generate the basic-auth hash:

```bash
caddy hash-password
# store the result in 1Password; export as VAULT_WEBDAV_HASH in caddy's systemd unit env
```

### Cloudflare Access Policy

- Hostname: `vault.kevinaton.com`
- Application type: Self-hosted
- Policies:
  - **Allow — Browser:** identity = `kevinyaton@gmail.com`, MFA required
  - **Allow — iPhone Service Token:** for the Remotely Save plugin (token in plugin headers; rotate every 90 days)

### Remotely Save Plugin (iPhone Obsidian)

- Install: Community Plugins → **Remotely Save** → Enable
- Settings:
  - Sync method: **WebDAV**
  - Server URL: `https://vault.kevinaton.com/`
  - Username / Password: Caddy basic-auth creds (from 1Password)
  - Custom headers: `CF-Access-Client-Id` and `CF-Access-Client-Secret` (iPhone Service Token)
  - Sync direction: **bidirectional**
  - Conflict policy: **keep both** (writes `.conflict-<timestamp>.md`)
  - Auto-sync: **on app open** (manual Pull/Push otherwise)

### GitHub Backup Hook

```cron
*/15 * * * * root cd /vault && git add -A && git commit -m "auto-backup $(date -Iminutes)" -q && git push -q origin main
```

Private GitHub repo. SSH key on server only.

## Security Notes

- Vault folder is **not** publicly accessible — Cloudflare Access gates `vault.kevinaton.com`.
- Defense in depth: CF Access (SSO+MFA) → Caddy basic-auth → filesystem perms.
- GitHub repo is **private**; SSH deploy key is server-only.
- Syncthing uses device IDs + symmetric key — LAN/known-devices only.
- TLS 1.3 end-to-end (device → Cloudflare → Caddy).
- **No PII in vault** — rule from day one, still load-bearing.
- LUKS at-rest encryption on `/vault` mount is a recommended Phase 6 hardening (not required given no-PII rule).

## Resource Footprint

| Component | RAM | CPU |
|---|---|---|
| Syncthing | ~40–80 MB | ~0% idle |
| Caddy (incl. webdav module) | ~10 MB extra | negligible |
| **Total** | **~50–90 MB** | **~0%** |

Fully negligible on 2 cores. **No new daemons** beyond what was already running.

## Sync Workflow (iPhone)

Daily flow:

1. Open Obsidian on iPhone.
2. Auto-sync (Pull) fires on app open.
3. Edit / capture as needed.
4. Tap **Remotely Save → Sync** before closing (or just close — next open will pull, and Remotely Save will queue any local writes for the next push if configured).
5. Within ~30 sec: changes are on `/vault` → reach MacBook via Syncthing → reach GitHub on the next 15-min cron tick.

If you forget to push:
- Local edits stay on iPhone.
- Next time you sync with connectivity, push reconciles. If MacBook touched the same note, you get a `.conflict-<timestamp>.md` sibling — resolve in 10 seconds inside Obsidian.

## Future Considerations

- **Real-time sync (LiveSync + CouchDB)** — if forgetting-to-push pain or conflict count climbs, native `apt install couchdb` + LiveSync plugin gets you chunk-merge real-time. Blueprint `26060401` documents the migration; `/vault` stays canonical through both. ~2-hour cutover.
- **Vector search** — when semantic search becomes a real pain point, add a small embedding job that reads `/vault` and writes to SQLite-vec or Qdrant. The vault doesn't need to change.
- **At-rest encryption** — add LUKS to the `/vault` mount if vault scope ever broadens beyond no-PII.
- **iPad** — same Remotely Save config, separate Cloudflare Service Token. Drop-in.

## Backup

| Layer | Method | RPO |
|---|---|---|
| Primary (working copy) | Syncthing → MacBook | seconds |
| Local on server | `/vault` filesystem | live |
| Off-site | GitHub private repo (cron push every 15 min) | 15 min |
| Cold | Server git repo backed up alongside main DB via Litestream → R2 | hourly |

Recovery path: clone the GitHub repo to a new server, point Syncthing at it, point Caddy WebDAV at it, re-pair clients. Full restore in under 30 minutes.
