/**
 * Unit tests for lib/auth/csrf.ts
 */

import { describe, expect, it } from 'vitest';
import { extractCsrfFromRequest, generateCsrfToken, verifyCsrfToken, verifyOrigin } from './csrf';

describe('generateCsrfToken', () => {
  it('returns a non-empty string', () => {
    expect(generateCsrfToken()).toBeTruthy();
  });

  it('returns a base64url string', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces different tokens on each call', () => {
    expect(generateCsrfToken()).not.toBe(generateCsrfToken());
  });
});

describe('verifyCsrfToken', () => {
  it('returns true for matching tokens', () => {
    const token = generateCsrfToken();
    expect(verifyCsrfToken(token, token)).toBe(true);
  });

  it('returns false for mismatched tokens', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(verifyCsrfToken(a, b)).toBe(false);
  });

  it('returns false when cookieValue is undefined', () => {
    expect(verifyCsrfToken(undefined, 'some-token')).toBe(false);
  });

  it('returns false when submittedValue is undefined', () => {
    expect(verifyCsrfToken('some-token', undefined)).toBe(false);
  });

  it('returns false when both are undefined', () => {
    expect(verifyCsrfToken(undefined, undefined)).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(verifyCsrfToken('', '')).toBe(false);
  });

  it('returns false for different-length tokens', () => {
    expect(verifyCsrfToken('short', 'much-longer-token-value')).toBe(false);
  });
});

describe('extractCsrfFromRequest', () => {
  it('extracts from X-CSRF-Token header (exact case)', () => {
    const headers = new Headers({ 'X-CSRF-Token': 'my-csrf-token' });
    expect(extractCsrfFromRequest(headers)).toBe('my-csrf-token');
  });

  it('extracts from x-csrf-token header (lowercase)', () => {
    const headers = new Headers({ 'x-csrf-token': 'my-csrf-token' });
    expect(extractCsrfFromRequest(headers)).toBe('my-csrf-token');
  });

  it('extracts from body csrf field', () => {
    const headers = new Headers();
    const body = { csrf: 'body-csrf-token', other: 'data' };
    expect(extractCsrfFromRequest(headers, body)).toBe('body-csrf-token');
  });

  it('prefers header over body', () => {
    const headers = new Headers({ 'X-CSRF-Token': 'header-token' });
    const body = { csrf: 'body-token' };
    expect(extractCsrfFromRequest(headers, body)).toBe('header-token');
  });

  it('returns undefined when no token present', () => {
    const headers = new Headers();
    expect(extractCsrfFromRequest(headers)).toBeUndefined();
  });
});

describe('verifyOrigin', () => {
  it('returns true when Origin matches Host', () => {
    const headers = new Headers({
      Origin: 'http://localhost:3000',
      Host: 'localhost:3000',
    });
    expect(verifyOrigin(headers)).toBe(true);
  });

  it('returns false when Origin does not match Host', () => {
    const headers = new Headers({
      Origin: 'http://evil.example.com',
      Host: 'localhost:3000',
    });
    expect(verifyOrigin(headers)).toBe(false);
  });

  it('returns true when no Origin header (same-origin requests may omit it)', () => {
    const headers = new Headers({ Host: 'localhost:3000' });
    expect(verifyOrigin(headers)).toBe(true);
  });

  it('returns false for a malformed Origin URL', () => {
    const headers = new Headers({
      Origin: 'not-a-url',
      Host: 'localhost:3000',
    });
    expect(verifyOrigin(headers)).toBe(false);
  });
});
