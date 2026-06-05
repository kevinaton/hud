## Role

Redis serves three purposes in the HUD:

1. **Cache** — short-lived, TTL-backed data (agent responses, query results)
2. **Job Queue** — reliable task offloading (one-shot jobs, background work)
3. **Pub/Sub** — real-time event broadcasting between agents and services

## Design

### Why Redis over alternatives
- **SQLite** isn't built for pub/sub or TTL-based expiration
- **File-based queues** lack atomicity and reliability under concurrent access
- Redis is battle-tested, single-binary, low-memory footprint

### Connection model
All services connect to Redis via a shared socket (`/var/run/redis/redis.sock`) or `localhost:6379`. No password in dev; `requirepass` via environment variable in production.

### Reliability
- `appendonly yes` + `appendfsync everysec` for durability
- `maxmemory 256mb` + `maxmemory-policy allkeys-lru` to bound RAM
- `save` disabled (Litestream handles DB backups; Redis is ephemeral by design)

## Ops Reference

### Key Patterns

| Pattern | Type | Purpose | TTL |
|---|---|---|---|
| `cache:{service}:{id}` | String (JSON) | Cached agent responses, query results | 1h |
| `queue:{name}` | List | FIFO job queue (LPUSH/BRPOP) | none |
| `pubsub:{channel}` | Channel | Real-time events (agent broadcasts, dashboard updates) | n/a |
| `session:{agent_id}` | Hash | Ephemeral session state (conversation context window) | 24h |
| `rate:{service}:{id}` | String (counter) | Rate limit counters | 1m |

### Pub/Sub Channels

| Channel | Publisher | Subscribers |
|---|---|---|
| `agent:run:{agent_id}` | Any agent | HUD, logging service |
| `agent:done:{run_id}` | Any agent | Orchestration, callbacks |
| `cache:invalidate:{pattern}` | Any service | All services (wildcard subscribe) |
| `telegram:update` | Telegram gateway | Multi-agent dispatcher |

### CLI Commands

```bash
# Check connectivity
redis-cli ping

# Monitor real-time commands
redis-cli monitor

# Inspect keys
redis-cli keys "cache:*"
redis-cli type cache:claude:abc123

# View queue depth
redis-cli llen queue:finance

# Flush stale cache (use with care)
redis-cli --scan --pattern "cache:*" | xargs redis-cli unlink
```

### Docker/Service Config

```yaml
# docker-compose or systemd unit
image: redis:7-alpine
command: redis-server --appendonly yes --appendfsync everysec --maxmemory 256mb --maxmemory-policy allkeys-lru
volumes:
  - redis-data:/data
```

### Environment Variables

```env
REDIS_URL=redis://localhost:6379
# or for socket:
REDIS_URL=unix:///var/run/redis/redis.sock
```

## Backup

Redis is **ephemeral by design** — data loss is expected for cache/queue on restart. Do not rely on Redis for durable storage.

For durable job queue, use a SQLite-backed queue (agents handle this natively via `finance-mcp` and `sqlite-mcp`).

If persistence is needed for cache, consider Redis RDB snapshots on a timer, but this is non-standard for this architecture.