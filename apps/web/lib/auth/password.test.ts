/**
 * Unit tests for lib/auth/password.ts
 */

import { describe, expect, it } from 'vitest';
import { DUMMY_HASH, MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from './password';

describe('hashPassword', () => {
  it('returns an argon2id encoded string', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('includes the correct parameters in the hash', async () => {
    const hash = await hashPassword('correct-horse-battery');
    // m=65536 (64MB), t=3, p=1
    expect(hash).toContain('m=65536');
    expect(hash).toContain('t=3');
    expect(hash).toContain('p=1');
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const h1 = await hashPassword('correct-horse-battery');
    const h2 = await hashPassword('correct-horse-battery');
    expect(h1).not.toBe(h2);
  });

  it('never returns the plaintext password in the hash', async () => {
    const plain = 'correct-horse-battery';
    const hash = await hashPassword(plain);
    expect(hash).not.toContain(plain);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    const result = await verifyPassword('correct-horse-battery', hash);
    expect(result).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    const result = await verifyPassword('wrong-password-12345', hash);
    expect(result).toBe(false);
  });

  it('returns false for empty password against valid hash', async () => {
    const hash = await hashPassword('correct-horse-battery');
    const result = await verifyPassword('', hash);
    expect(result).toBe(false);
  });
});

describe('DUMMY_HASH', () => {
  it('is a valid argon2id encoded string (for constant-time path)', () => {
    expect(DUMMY_HASH).toMatch(/^\$argon2id\$/);
    expect(DUMMY_HASH).toContain('m=65536');
    expect(DUMMY_HASH).toContain('t=3');
    expect(DUMMY_HASH).toContain('p=1');
  });

  it('does not verify against any plausible password', async () => {
    // DUMMY_HASH uses synthetic bytes — verifyPassword should return false
    const result = await verifyPassword('any-password-12345', DUMMY_HASH).catch(() => false);
    expect(result).toBe(false);
  });
});

describe('MIN_PASSWORD_LENGTH', () => {
  it('is at least 12', () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
  });
});
