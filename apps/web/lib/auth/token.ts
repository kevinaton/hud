/**
 * lib/auth/token.ts
 *
 * Session token generation and hashing.
 *
 * - generateToken(): 256-bit crypto.randomBytes, base64url encoded (opaque cookie value)
 * - hashToken(token): sha256 hex — the value stored in sessions.id
 *
 * The raw token NEVER touches the DB.
 * DB compromise does not yield usable session cookies.
 */

import { createHash, randomBytes } from 'node:crypto';

/**
 * Generate a cryptographically secure opaque session token.
 * Returns both the plain (cookie value) and the hash (DB value).
 */
export function generateToken(): { plain: string; hash: string } {
  const buf = randomBytes(32);
  const plain = buf.toString('base64url');
  const hash = createHash('sha256').update(plain).digest('hex');
  return { plain, hash };
}

/**
 * Hash a raw token for DB lookup / storage.
 * Use this when reading the cookie to look up the session row.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
