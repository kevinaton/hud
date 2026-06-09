/**
 * Tests for per-identity token-bucket rate limiter.
 *
 * Covers:
 *   - Bucket initialises at burst capacity
 *   - Requests within burst are allowed
 *   - Burst exhaustion → 429 with correct retryAfterSec
 *   - Bucket refills proportionally over time
 *   - Write vs read bucket isolation (write exhaust does not touch read)
 *   - Per-identity isolation (identity A hitting limit does not affect B)
 *   - Per-identity config overrides via configure()
 *   - Non-tool requests (toolName=null) are treated as reads
 *   - snapshot() returns current token counts
 *   - snapshot() returns null for unknown identities
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BURST,
  DEFAULT_READS_PER_MIN,
  DEFAULT_WRITES_PER_MIN,
  RateLimiter,
} from '../http/rate-limit.js';

const WRITE_TOOL = 'cashflow.add';
const READ_TOOL = 'cashflow.list';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drain a bucket for `identity` by calling consume `n` times at the same tick. */
function drainN(limiter: RateLimiter, identity: string, tool: string | null, n: number, nowMs = 0) {
  for (let i = 0; i < n; i++) {
    limiter.consume(identity, tool, nowMs);
  }
}

// ---------------------------------------------------------------------------
// Bucket initialisation
// ---------------------------------------------------------------------------

describe('RateLimiter — bucket initialisation', () => {
  it('starts write bucket at burst capacity', () => {
    const limiter = new RateLimiter();
    drainN(limiter, 'a', WRITE_TOOL, DEFAULT_BURST, 0);
    const snap = limiter.snapshot('a');
    expect(snap).not.toBeNull();
    // After exactly burst-many consumes the bucket should be at 0 (or very close)
    expect(snap!.writeTokens).toBeCloseTo(0, 5);
  });

  it('starts read bucket at burst capacity', () => {
    const limiter = new RateLimiter();
    drainN(limiter, 'a', READ_TOOL, DEFAULT_BURST, 0);
    const snap = limiter.snapshot('a');
    expect(snap!.readTokens).toBeCloseTo(0, 5);
  });

  it('allows exactly burst-many requests without refill', () => {
    const limiter = new RateLimiter();
    const results = Array.from({ length: DEFAULT_BURST }, () =>
      limiter.consume('a', READ_TOOL, 0),
    );
    expect(results.every((r) => r.allowed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Burst exhaustion
// ---------------------------------------------------------------------------

describe('RateLimiter — burst exhaustion', () => {
  it('returns allowed=false after burst exhausted', () => {
    const limiter = new RateLimiter();
    drainN(limiter, 'a', READ_TOOL, DEFAULT_BURST, 0);
    const result = limiter.consume('a', READ_TOOL, 0);
    expect(result.allowed).toBe(false);
  });

  it('returns a positive retryAfterSec when rate limited', () => {
    const limiter = new RateLimiter();
    drainN(limiter, 'a', WRITE_TOOL, DEFAULT_BURST, 0);
    const result = limiter.consume('a', WRITE_TOOL, 0);
    if (result.allowed) throw new Error('expected rate limited');
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it('retryAfterSec reflects write rate (60/min = 1/s)', () => {
    const limiter = new RateLimiter({ writesPerMin: 60, burst: 1 });
    limiter.consume('a', WRITE_TOOL, 0); // consume the single burst token
    const result = limiter.consume('a', WRITE_TOOL, 0);
    if (result.allowed) throw new Error('expected rate limited');
    // Need 1 token at 1/s = 1s
    expect(result.retryAfterSec).toBe(1);
  });

  it('retryAfterSec is ceil (never returns 0)', () => {
    const limiter = new RateLimiter({ writesPerMin: 60, burst: 1 });
    limiter.consume('a', WRITE_TOOL, 0);
    // 0.5 s elapsed — 0.5 tokens refilled, still need 0.5 more
    const result = limiter.consume('a', WRITE_TOOL, 500);
    if (result.allowed) throw new Error('expected rate limited');
    expect(result.retryAfterSec).toBe(1); // ceil(0.5) = 1
  });
});

// ---------------------------------------------------------------------------
// Refill over time
// ---------------------------------------------------------------------------

describe('RateLimiter — token refill', () => {
  it('allows a request again after sufficient time has passed', () => {
    const limiter = new RateLimiter({ writesPerMin: 60, burst: 1 });
    limiter.consume('a', WRITE_TOOL, 0); // t=0 drain
    // 1s later: write rate = 1/s → 1 token refilled
    const result = limiter.consume('a', WRITE_TOOL, 1000);
    expect(result.allowed).toBe(true);
  });

  it('caps refilled tokens at burst capacity', () => {
    const limiter = new RateLimiter({ readsPerMin: 600, burst: DEFAULT_BURST });
    drainN(limiter, 'a', READ_TOOL, DEFAULT_BURST, 0);
    // Wait 60s — could refill 600 tokens, but capped at burst
    const result = limiter.consume('a', READ_TOOL, 60_000);
    expect(result.allowed).toBe(true);
    const snap = limiter.snapshot('a');
    // After consuming 1 from a full bucket, should be burst-1
    expect(snap!.readTokens).toBeCloseTo(DEFAULT_BURST - 1, 4);
  });
});

// ---------------------------------------------------------------------------
// Write vs read bucket isolation
// ---------------------------------------------------------------------------

describe('RateLimiter — write/read bucket isolation', () => {
  it('exhausting write bucket does not affect read bucket', () => {
    const limiter = new RateLimiter();
    drainN(limiter, 'a', WRITE_TOOL, DEFAULT_BURST + 5, 0); // drain write, extra calls fail
    // Read should still be at full burst
    const result = limiter.consume('a', READ_TOOL, 0);
    expect(result.allowed).toBe(true);
  });

  it('exhausting read bucket does not affect write bucket', () => {
    const limiter = new RateLimiter();
    drainN(limiter, 'a', READ_TOOL, DEFAULT_BURST + 5, 0); // drain read
    const result = limiter.consume('a', WRITE_TOOL, 0);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-identity isolation
// ---------------------------------------------------------------------------

describe('RateLimiter — per-identity isolation', () => {
  it('identity A exhausted does not affect identity B', () => {
    const limiter = new RateLimiter();
    drainN(limiter, 'platform:a', READ_TOOL, DEFAULT_BURST + 5, 0);
    const result = limiter.consume('platform:b', READ_TOOL, 0);
    expect(result.allowed).toBe(true);
  });

  it('each identity gets its own independent buckets', () => {
    const limiter = new RateLimiter();
    limiter.consume('id:x', WRITE_TOOL, 0);
    limiter.consume('id:y', WRITE_TOOL, 0);
    const snapX = limiter.snapshot('id:x');
    const snapY = limiter.snapshot('id:y');
    expect(snapX!.writeTokens).toBeCloseTo(DEFAULT_BURST - 1, 5);
    expect(snapY!.writeTokens).toBeCloseTo(DEFAULT_BURST - 1, 5);
  });
});

// ---------------------------------------------------------------------------
// Per-identity config overrides
// ---------------------------------------------------------------------------

describe('RateLimiter — configure() overrides', () => {
  it('applies per-identity writesPerMin override', () => {
    const limiter = new RateLimiter({ writesPerMin: 60, burst: 1 });
    limiter.configure('premium', { writesPerMin: 120, burst: 1 });
    limiter.consume('premium', WRITE_TOOL, 0); // drain the 1 token
    // At 120/min = 2/s, 0.5s → 1 token refilled
    const result = limiter.consume('premium', WRITE_TOOL, 500);
    expect(result.allowed).toBe(true);
  });

  it('configure() before any consume pre-populates the bucket', () => {
    const limiter = new RateLimiter();
    limiter.configure('pre', { writesPerMin: 30, burst: 5 });
    const snap = limiter.snapshot('pre');
    expect(snap).not.toBeNull();
    expect(snap!.writeTokens).toBe(5);
  });

  it('configure() after first consume updates config without resetting tokens', () => {
    const limiter = new RateLimiter({ burst: DEFAULT_BURST });
    limiter.consume('a', WRITE_TOOL, 0); // consume 1
    limiter.configure('a', { writesPerMin: 30 });
    const snap = limiter.snapshot('a');
    // Token should still reflect 1 consumed (not reset to burst)
    expect(snap!.writeTokens).toBeCloseTo(DEFAULT_BURST - 1, 5);
  });
});

// ---------------------------------------------------------------------------
// null toolName treated as read
// ---------------------------------------------------------------------------

describe('RateLimiter — null toolName', () => {
  it('treats null toolName as a read', () => {
    const limiter = new RateLimiter();
    drainN(limiter, 'a', null, DEFAULT_BURST, 0);
    // Read bucket exhausted
    const readResult = limiter.consume('a', READ_TOOL, 0);
    expect(readResult.allowed).toBe(false);
    // Write bucket untouched
    const writeResult = limiter.consume('a', WRITE_TOOL, 0);
    expect(writeResult.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// snapshot()
// ---------------------------------------------------------------------------

describe('RateLimiter — snapshot()', () => {
  it('returns null for unknown identity', () => {
    const limiter = new RateLimiter();
    expect(limiter.snapshot('nobody')).toBeNull();
  });

  it('returns non-null after first consume', () => {
    const limiter = new RateLimiter();
    limiter.consume('someone', READ_TOOL, 0);
    expect(limiter.snapshot('someone')).not.toBeNull();
  });

  it('decrements by 1 per consume', () => {
    const limiter = new RateLimiter({ burst: DEFAULT_BURST });
    limiter.consume('a', READ_TOOL, 0);
    limiter.consume('a', READ_TOOL, 0);
    const snap = limiter.snapshot('a');
    expect(snap!.readTokens).toBeCloseTo(DEFAULT_BURST - 2, 5);
  });
});

// ---------------------------------------------------------------------------
// Default constant sanity checks
// ---------------------------------------------------------------------------

describe('RateLimiter — default constants', () => {
  it('DEFAULT_WRITES_PER_MIN is 60', () => {
    expect(DEFAULT_WRITES_PER_MIN).toBe(60);
  });
  it('DEFAULT_READS_PER_MIN is 600', () => {
    expect(DEFAULT_READS_PER_MIN).toBe(600);
  });
  it('DEFAULT_BURST is 10', () => {
    expect(DEFAULT_BURST).toBe(10);
  });
});
