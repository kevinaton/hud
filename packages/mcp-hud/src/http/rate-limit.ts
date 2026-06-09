/**
 * Per-identity token-bucket rate limiter for the HTTP/SSE transport.
 *
 * Each identity gets two independent buckets:
 *   - write bucket: cashflow.add, cashflow.edit, cashflow.delete, cashflow.createCategory
 *   - read bucket:  everything else (list, summary, categories, ping, initialize, tools/list…)
 *
 * Defaults (overridable per-identity in mcp-acl.yaml via `rateLimit` field):
 *   - writesPerMin: 60  (1/s sustained, burst of 10)
 *   - readsPerMin:  600 (10/s sustained, burst of 10)
 *   - burst:        10  (max tokens in each bucket)
 *
 * Algorithm: leaky-bucket / token-bucket hybrid.
 *   tokens = min(tokens + elapsed * ratePerSec, capacity)
 *   consume 1 token per request; reject with retryAfterSec if tokens < 1.
 *
 * Thread-safety: Node.js is single-threaded — no locks needed.
 * Persistence: in-memory only; buckets reset on daemon restart (acceptable).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WRITE_TOOLS = new Set([
  'cashflow.add',
  'cashflow.edit',
  'cashflow.delete',
  'cashflow.createCategory',
]);

export const DEFAULT_WRITES_PER_MIN = 60;
export const DEFAULT_READS_PER_MIN = 600;
export const DEFAULT_BURST = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  writesPerMin: number;
  readsPerMin: number;
  burst: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

interface IdentityBuckets {
  write: BucketState;
  read: BucketState;
  config: RateLimitConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isWriteTool(toolName: string | null): boolean {
  if (toolName === null) return false;
  return WRITE_TOOLS.has(toolName);
}

function refillBucket(bucket: BucketState, ratePerSec: number, capacity: number, nowMs: number): void {
  const elapsedSec = (nowMs - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(bucket.tokens + elapsedSec * ratePerSec, capacity);
  bucket.lastRefillMs = nowMs;
}

function consumeOne(
  bucket: BucketState,
  ratePerSec: number,
  capacity: number,
  nowMs: number,
): RateLimitResult {
  refillBucket(bucket, ratePerSec, capacity, nowMs);
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true };
  }
  // Time until 1 token is available
  const retryAfterSec = Math.ceil((1 - bucket.tokens) / ratePerSec);
  return { allowed: false, retryAfterSec };
}

// ---------------------------------------------------------------------------
// RateLimiter
// ---------------------------------------------------------------------------

/**
 * Stateful per-identity token-bucket rate limiter.
 * Instantiate once per daemon lifetime; share across all requests.
 */
export class RateLimiter {
  private readonly identities = new Map<string, IdentityBuckets>();
  private readonly defaultConfig: RateLimitConfig;

  constructor(defaultConfig?: Partial<RateLimitConfig>) {
    this.defaultConfig = {
      writesPerMin: defaultConfig?.writesPerMin ?? DEFAULT_WRITES_PER_MIN,
      readsPerMin: defaultConfig?.readsPerMin ?? DEFAULT_READS_PER_MIN,
      burst: defaultConfig?.burst ?? DEFAULT_BURST,
    };
  }

  /**
   * Override rate limit config for a specific identity.
   * Called at startup when loading mcp-acl.yaml entries that have `rateLimit`.
   */
  configure(identity: string, config: Partial<RateLimitConfig>): void {
    const existing = this.identities.get(identity);
    const merged: RateLimitConfig = {
      writesPerMin: config.writesPerMin ?? this.defaultConfig.writesPerMin,
      readsPerMin: config.readsPerMin ?? this.defaultConfig.readsPerMin,
      burst: config.burst ?? this.defaultConfig.burst,
    };
    if (existing) {
      existing.config = merged;
    } else {
      // lastRefillMs=0 (epoch) means the first consume() call will see elapsed = nowMs/1000
      // seconds, which refills to capacity regardless of how large nowMs is — always capped
      // at burst. Avoids Date.now() dependency so tests can use synthetic clock values.
      this.identities.set(identity, {
        config: merged,
        write: { tokens: merged.burst, lastRefillMs: 0 },
        read: { tokens: merged.burst, lastRefillMs: 0 },
      });
    }
  }

  /**
   * Attempt to consume one token for the given identity + tool.
   * Creates a fresh bucket on first call for an identity (uses default config).
   *
   * @param identity  Resolved bearer identity, e.g. 'platform:hermes-gateway'
   * @param toolName  MCP tool name (null for non-tools/call methods → treated as read)
   * @param nowMs     Current time in ms (injectable for tests)
   */
  consume(identity: string, toolName: string | null, nowMs = Date.now()): RateLimitResult {
    let entry = this.identities.get(identity);
    if (!entry) {
      entry = {
        config: { ...this.defaultConfig },
        write: { tokens: this.defaultConfig.burst, lastRefillMs: nowMs },
        read: { tokens: this.defaultConfig.burst, lastRefillMs: nowMs },
      };
      this.identities.set(identity, entry);
    }

    const { config } = entry;
    const write = isWriteTool(toolName);
    const bucket = write ? entry.write : entry.read;
    const ratePerSec = write
      ? config.writesPerMin / 60
      : config.readsPerMin / 60;

    return consumeOne(bucket, ratePerSec, config.burst, nowMs);
  }

  /**
   * Returns current token counts for an identity (for testing / observability).
   * Returns null if the identity has no bucket yet.
   */
  snapshot(identity: string): { writeTokens: number; readTokens: number } | null {
    const entry = this.identities.get(identity);
    if (!entry) return null;
    return { writeTokens: entry.write.tokens, readTokens: entry.read.tokens };
  }
}
