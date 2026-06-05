## Role

Sentry captures stack traces and errors from all agent processes and services. Uptime Kuma monitors service availability and sends alerts on downtime.

## Design

### Why both
- **Sentry** — application-level observability (errors, release tracking)
- **Uptime Kuma** — host/network-level availability (is the service responding at all?)

### Connection model
All services push errors to Sentry via SDK. Uptime Kuma polls HTTP endpoints and checks ports.

### Error tracking conventions
- **Start with 1–2 Sentry projects** — one for agentic services (`claude-agent`, `gemini-agent`, `opencode-agent`), one for infrastructure (`telegram-gateway`, `dashboard-api`). Split to additional projects only when volume or team size demands it.
- Release tags match git SHA for deploy correlation
- Session data stripped of PII before sending
- **Performance tracing is paid** — enable only for the 1–2 services where you are actively optimizing latency. Do not enable globally on free tier.

## Ops Reference

### Key Patterns

| Pattern | Type | Purpose |
|---|---|---|
| `sentry:{project}:{env}` | DSN config | Per-project data source name |
| `sentry:health` | HTTP endpoint | `/api/health` ping for Uptime Kuma |

### Environment Variables

```env
SENTRY_DSN=https://abc123@o123.ingest.sentry.io/456
SENTRY_ORG=kevinaton
SENTRY_PROJECT=claude-agent
SENTRY_AUTH_TOKEN=sntrys_...
```

### Sentry CLI (release management)

```bash
# Create release
sentry-cli releases new v1.2.3

# Associate commits
sentry-cli releases set-commits --commit "repo@ref"

# Deploy notification
sentry-cli releases deploys v1.2.3 new --env production
```

### Uptime Kuma Checks

> **Note:** If Uptime Kuma runs outside the target host, `localhost` checks will not reach the service. Use the host's LAN IP or DNS name instead.

| Service | Type | URL/Port | Interval |
|---|---|---|---|
| HUD | HTTP | https://hud.kevinaton.com | 2m |
| Telegram bot | HTTP | https://telegram-bot.kevinaton.com/health | 3m |
| Caddy ingress | HTTP | http://localhost:2019/metrics | 1m |
| SSH (bastion) | TCP | bastion.kevinaton.com:22 | 3m |
| Redis | TCP | localhost:6379 | 2m |

### Alert Channels

| Event | Channel |
|---|---|
| Sentry error spike (>10/min) | Telegram |
| Uptime Kuma downtime | Telegram + email |
| Sentry performance regression | ~~Email~~ — drop; caused by model provider, not your code. Review on-demand. |

## Pricing

### Sentry
| Tier | Limit |
|---|---|
| Free | 5 projects, 5K events/month, 7-day retention |
| Paid (~$26/mo) | Unlimited projects, 250K events/month, 90-day retention + performance tracing |

> **Watch out:** Performance traces generate many events per request. Enable performance monitoring only on paid tier or for selected high-value services only. Error-only tracking is sufficient for most services on free tier.

### Uptime Kuma
**100% free.** Self-hosted. No pricing tier, no licensing. SQLite only.

## Backup

Sentry cloud (sentry.io) is the source of truth. Self-hosted Sentry would need its own backup strategy (Postgres + object storage).

Uptime Kuma config is a single SQLite file, backed up via Litestream alongside main DB.