/**
 * Unit tests for lib/auth/token.ts
 */

import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from './token';

describe('generateToken', () => {
  it('returns a plain token and its sha256 hash', () => {
    const { plain, hash } = generateToken();
    expect(plain).toBeTruthy();
    expect(hash).toBeTruthy();
    expect(plain).not.toBe(hash);
  });

  it('plain token is base64url encoded (no +, /, or = chars)', () => {
    const { plain } = generateToken();
    expect(plain).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hash is a 64-character hex string (sha256)', () => {
    const { hash } = generateToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique tokens on each call', () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1.plain).not.toBe(t2.plain);
    expect(t1.hash).not.toBe(t2.hash);
  });

  it('plain token is approximately 256 bits (43 base64url chars)', () => {
    const { plain } = generateToken();
    // 32 bytes → 43 chars in base64url (without padding)
    expect(plain.length).toBeGreaterThanOrEqual(42);
    expect(plain.length).toBeLessThanOrEqual(44);
  });
});

describe('hashToken', () => {
  it('returns the same sha256 hex for the same input', () => {
    const token = 'test-token-value';
    const h1 = hashToken(token);
    const h2 = hashToken(token);
    expect(h1).toBe(h2);
  });

  it('returns a 64-char hex string', () => {
    const h = hashToken('some-random-token');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the hash produced by generateToken', () => {
    const { plain, hash } = generateToken();
    expect(hashToken(plain)).toBe(hash);
  });

  it('raw token and its hash are never equal', () => {
    const { plain, hash } = generateToken();
    expect(plain).not.toBe(hash);
  });
});
