/**
 * lib/auth/password.ts
 *
 * argon2id password hashing and verification.
 *
 * Parameters (locked — do not change without architect sign-off):
 *   memoryCost: 65536 (64 MB)
 *   timeCost:   3
 *   parallelism: 1
 *   hashLength:  32
 *
 * Minimum password length: 12 characters (NIST 800-63B aligned).
 * No other complexity rules.
 */

import { hash, verify } from '@node-rs/argon2';

const ARGON2_OPTS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

export const MIN_PASSWORD_LENGTH = 12;

/**
 * Hash a plaintext password with argon2id.
 * Returns the encoded string (includes salt + params) suitable for storage.
 * Plaintext is NEVER logged or stored.
 */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTS);
}

/**
 * Verify a plaintext password against an argon2id encoded hash.
 * Constant-time comparison is handled internally by the argon2 library.
 */
export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  return verify(encoded, plain);
}

/**
 * A fixed dummy hash used for constant-time error paths.
 * When a user is not found, we still call verifyPassword against this hash
 * to keep response time in the same envelope as a real verification.
 * This prevents timing oracles on valid vs invalid email addresses.
 */
export const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$YzVaYXFxTmRXUFZOTTVQYQ$0000000000000000000000000000000000000000000';
