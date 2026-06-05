## Role

Caddy is the ingress/reverse proxy for the entire HUD. Every inbound HTTP request — whether from Cloudflare Tunnel to the dashboard, Telegram webhooks, or internal service-to-service communication — flows through Caddy.

## Responsibilities

| Responsibility | Detail |
|---|---|
| **TLS termination** | Pulls certificates automatically from Let's Encrypt. No manual cert management. |
| **Reverse proxy** | Routes external requests to internal services (HUD, Telegram bot, etc.) |
| **Static file serving** | Serves the dashboard build artifacts |
| **Internal metrics** | Exposes `http://localhost:2019/metrics` for Uptime Kuma |
| **HTTP/2 + HTTP/3** | Enabled by default |

## Why Caddy (not Nginx, not Traefik)

| | Caddy | Nginx | Traefik |
|---|---|---|---|
| License | Apache 2.0 (free) | GPLv2 (free) | MIT (free) |
| Binary | Single static binary | Multiple deps | Container-first |
| TLS | Automatic, zero-config | Manual or certbot | Manual or certbot |
| Config style | `Caddyfile` (simple) | nginx.conf (complex) | Labels/dynamic |
| RAM usage | ~30–80 MB | ~20–60 MB | ~100–200 MB |
| **Fit for 2-core** | ✅ Ideal | ✅ Fine | ⚠️ Heavy |

Caddy's automatic TLS is the key differentiator. On a homelab with Cloudflare Tunnel, you could skip TLS at the Caddy layer entirely (Cloudflare handles it), but Caddy still earns its place for routing, health checks, and serving the dashboard.

## Connection Model

```
Internet → Cloudflare Tunnel → Caddy (:80/:443) → HUD
                                              → Telegram bot
                                              → Internal services
```

## Ops Reference

### Key Ports

| Port | Purpose |
|---|---|
| 80 | HTTP (redirects to 443) |
| 443 | HTTPS (TLS termination) |
| 2019 | Metrics endpoint (`/metrics`) |

### Key Patterns

| Pattern | Purpose |
|---|---|
| `caddy:2019/metrics` | Uptime Kuma health check |
| `Caddyfile` | Single config file, version-controlled |

### Minimal Caddyfile

```caddy
hud.kevinaton.com {
    reverse_proxy localhost:3000
    encode gzip
}

telegram-bot.kevinaton.com {
    reverse_proxy localhost:8080
}

:2019 {
    handle /metrics* {
        prometheus_metrics
    }
}
```

## Resource Footprint

| Resource | Usage |
|---|---|
| RAM | ~30–80 MB |
| CPU | Negligible at idle; <1% under load on 2-core |
| Disk | ~30 MB binary |

## Backup

Caddy config (`Caddyfile`) lives in `/etc/caddy/` and should be git-mirrored as part of your server dotfiles or a dedicated config repo.

## Security Notes

- Caddy binds to `localhost` for internal services where possible
- External-facing routes protected by Cloudflare Access (SSO + MFA)
- TLS 1.2+ enforced by default
- No PHP/ CGI — pure proxy, minimal attack surface