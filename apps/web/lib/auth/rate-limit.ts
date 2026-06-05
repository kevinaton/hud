/**
 * lib/auth/rate-limit.ts
 *
 * IP-based rate limiter for /api/auth/login.
 * Uses rate-limiter-flexible with a memory store (Redis-ready interface for Phase 1 swap).
 *
 * Config:
 *   - 5 attempts / 15 min / IP on login
 *   - 3 attempts / 1 hour / IP on signup
 *
 * On block: callers should return HTTP 429 with a Retry-After header.
 */

import { RateLimiterMemory, type RateLimiterRes } from 'rate-limiter-flexible';

// ---------------------------------------------------------------------------
// Login rate limiter: 5 attempts per 15 minutes per IP
// ---------------------------------------------------------------------------
const loginLimiter = new RateLimiterMemory({
  points: 5,
  duration: 15 * 60, // 15 minutes in seconds
});

// ---------------------------------------------------------------------------
// Signup rate limiter: 3 attempts per hour per IP
// ---------------------------------------------------------------------------
const signupLimiter = new RateLimiterMemory({
  points: 3,
  duration: 60 * 60, // 1 hour in seconds
});

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Check the login rate limit for the given IP.
 * Returns { allowed: true } if within limit, or { allowed: false, retryAfterSeconds }
 * if the limit is exceeded.
 *
 * Does NOT throw — callers check the result.
 */
export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  try {
    await loginLimiter.consume(ip);
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (e) {
    const res = e as RateLimiterRes;
    const retryAfterSeconds = Math.ceil(res.msBeforeNext / 1000);
    return { allowed: false, retryAfterSeconds };
  }
}

/**
 * Reset the login rate limit for an IP (called after successful login).
 */
export async function resetLoginRateLimit(ip: string): Promise<void> {
  await loginLimiter.delete(ip);
}

/**
 * Check the signup rate limit for the given IP.
 */
export async function checkSignupRateLimit(ip: string): Promise<RateLimitResult> {
  try {
    await signupLimiter.consume(ip);
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (e) {
    const res = e as RateLimiterRes;
    const retryAfterSeconds = Math.ceil(res.msBeforeNext / 1000);
    return { allowed: false, retryAfterSeconds };
  }
}
