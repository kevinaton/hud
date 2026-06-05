/**
 * lib/money/index.ts
 *
 * The complete money library for HUD.
 *
 * INVARIANT: all amounts are signed integers in minor units (centavos for PHP).
 * No floats. No division outside of formatMoney and pctDelta.
 * See hud-money SKILL.md for the full rules.
 *
 * Re-exports formatMoney from ./format so existing imports of either path work.
 */

export { formatMoney } from './format';

// ---------------------------------------------------------------------------
// Currency type
// ---------------------------------------------------------------------------
export type Currency = 'PHP' | string;

// ---------------------------------------------------------------------------
// parseToMinor (also exported as parseMoney for skill-aligned callers)
//
// Converts a user-facing decimal string ("280.00", "1234.5", "-99") into a
// signed integer in minor units.
//
// Rules:
//   - Strips commas and whitespace before parsing.
//   - Multiplies by 100 and rounds to the nearest integer.
//   - Throws on NaN, non-finite, or values that exceed Number.MAX_SAFE_INTEGER.
// ---------------------------------------------------------------------------
export function parseToMinor(input: string): number {
  const cleaned = input.replace(/,/g, '').trim();

  if (cleaned === '') {
    throw new RangeError('parseToMinor: empty string is not a valid amount');
  }

  const value = Number(cleaned);

  if (!Number.isFinite(value)) {
    throw new RangeError(`parseToMinor: invalid numeric string "${input}"`);
  }

  const minor = Math.round(value * 100);

  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`parseToMinor: value "${input}" exceeds safe integer range`);
  }

  return minor;
}

/** Alias for parseToMinor, skill-aligned name. */
export const parseMoney = parseToMinor;

// ---------------------------------------------------------------------------
// addMinor
//
// Adds two integer minor-unit amounts. Both operands MUST be integers.
// Throws if either input is not an integer.
// ---------------------------------------------------------------------------
export function addMinor(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new TypeError(`addMinor: operands must be integers, got ${a} and ${b}`);
  }
  return a + b;
}

// ---------------------------------------------------------------------------
// subtractMinor
//
// Subtracts b from a. Both operands MUST be integers.
// Throws if either input is not an integer.
// ---------------------------------------------------------------------------
export function subtractMinor(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new TypeError(`subtractMinor: operands must be integers, got ${a} and ${b}`);
  }
  return a - b;
}

// ---------------------------------------------------------------------------
// sumMinor
//
// Sums a list of integer minor-unit amounts. Returns 0 for an empty array.
// ---------------------------------------------------------------------------
export function sumMinor(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

// ---------------------------------------------------------------------------
// pctDelta
//
// Returns the integer percent change from previous → current.
// This is the ONLY function in the codebase that may divide a money value.
// Returns 0 if previous is 0 (undefined delta).
//
// Examples:
//   pctDelta(1500, 1200) → 25     (+25%)
//   pctDelta(1000, 1500) → -33    (-33%)
// ---------------------------------------------------------------------------
export function pctDelta(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
