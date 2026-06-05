import { describe, expect, it } from 'vitest';
import {
  addMinor,
  formatMoney,
  parseMoney,
  parseToMinor,
  pctDelta,
  subtractMinor,
  sumMinor,
} from './index';

// ---------------------------------------------------------------------------
// formatMoney
// ---------------------------------------------------------------------------
describe('formatMoney', () => {
  it('formats zero', () => {
    expect(formatMoney(0, 'PHP')).toBe('P0.00');
  });

  it('formats a negative value', () => {
    // -280.00 PHP
    expect(formatMoney(-28000, 'PHP')).toBe('-P280.00');
  });

  it('formats an amount with 2 decimals (< 7 integer digits)', () => {
    // 192,938.45 PHP
    expect(formatMoney(19293845, 'PHP')).toBe('P192,938.45');
  });

  it('formats a large amount with no decimals (>= 7 integer digits)', () => {
    // 125,999,597.00 PHP — 9 integer digits → no decimals
    expect(formatMoney(12599959700, 'PHP')).toBe('P125,999,597');
  });

  it('formats large negative amounts with no decimals', () => {
    // -125,999,597.00 PHP
    expect(formatMoney(-12599959700, 'PHP')).toBe('-P125,999,597');
  });

  it('formats a small positive amount', () => {
    expect(formatMoney(100, 'PHP')).toBe('P1.00');
  });

  it('formats 1 centavo correctly', () => {
    expect(formatMoney(1, 'PHP')).toBe('P0.01');
  });

  it('uses ISO code as symbol for unknown currencies', () => {
    expect(formatMoney(10000, 'USD')).toBe('USD100.00');
  });

  it('formats exactly 7-digit integer part with no decimals', () => {
    // 1,000,000.00 PHP — 7 integer digits → no decimals
    expect(formatMoney(100000000, 'PHP')).toBe('P1,000,000');
  });
});

// ---------------------------------------------------------------------------
// parseToMinor / parseMoney
// ---------------------------------------------------------------------------
describe('parseToMinor', () => {
  it('parses a plain decimal string', () => {
    expect(parseToMinor('280.00')).toBe(28000);
  });

  it('parses a negative decimal string', () => {
    expect(parseToMinor('-280.00')).toBe(-28000);
  });

  it('parses zero', () => {
    expect(parseToMinor('0')).toBe(0);
  });

  it('parses zero decimal', () => {
    expect(parseToMinor('0.00')).toBe(0);
  });

  it('rounds to nearest centavo', () => {
    // 1.006 × 100 = 100.6, Math.round → 101
    expect(parseToMinor('1.006')).toBe(101);
    // 1.004 × 100 = 100.4, Math.round → 100
    expect(parseToMinor('1.004')).toBe(100);
  });

  it('strips commas from formatted strings', () => {
    expect(parseToMinor('192,938.45')).toBe(19293845);
  });

  it('parses large amounts', () => {
    expect(parseToMinor('125999597')).toBe(12599959700);
  });

  it('throws on NaN input', () => {
    expect(() => parseToMinor('abc')).toThrow(RangeError);
  });

  it('throws on empty string', () => {
    expect(() => parseToMinor('')).toThrow(RangeError);
  });

  it('parseMoney is an alias for parseToMinor', () => {
    expect(parseMoney('100.00')).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// addMinor
// ---------------------------------------------------------------------------
describe('addMinor', () => {
  it('adds two positive amounts', () => {
    expect(addMinor(10000, 5000)).toBe(15000);
  });

  it('adds positive and negative (net)', () => {
    expect(addMinor(10000, -3000)).toBe(7000);
  });

  it('adds two negatives', () => {
    expect(addMinor(-5000, -3000)).toBe(-8000);
  });

  it('adds zeros', () => {
    expect(addMinor(0, 0)).toBe(0);
  });

  it('throws if first operand is a float', () => {
    expect(() => addMinor(1.5, 100)).toThrow(TypeError);
  });

  it('throws if second operand is a float', () => {
    expect(() => addMinor(100, 1.5)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// subtractMinor
// ---------------------------------------------------------------------------
describe('subtractMinor', () => {
  it('subtracts two amounts', () => {
    expect(subtractMinor(10000, 3000)).toBe(7000);
  });

  it('produces a negative result when b > a', () => {
    expect(subtractMinor(3000, 10000)).toBe(-7000);
  });

  it('subtracts zero', () => {
    expect(subtractMinor(5000, 0)).toBe(5000);
  });

  it('throws if first operand is a float', () => {
    expect(() => subtractMinor(1.5, 100)).toThrow(TypeError);
  });

  it('throws if second operand is a float', () => {
    expect(() => subtractMinor(100, 1.5)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// sumMinor
// ---------------------------------------------------------------------------
describe('sumMinor', () => {
  it('sums a list of positive amounts', () => {
    expect(sumMinor([10000, 5000, 3000])).toBe(18000);
  });

  it('sums mixed positive and negative amounts', () => {
    expect(sumMinor([10000, -3000, -2000])).toBe(5000);
  });

  it('returns 0 for empty array', () => {
    expect(sumMinor([])).toBe(0);
  });

  it('sums large amounts without precision loss', () => {
    // Multiple 7-digit minor amounts
    const amounts = Array.from({ length: 100 }, () => 1000000); // 100 × 10,000.00 PHP
    expect(sumMinor(amounts)).toBe(100000000); // 1,000,000.00 PHP
  });
});

// ---------------------------------------------------------------------------
// pctDelta
// ---------------------------------------------------------------------------
describe('pctDelta', () => {
  it('returns 25 for +25% growth', () => {
    expect(pctDelta(1500, 1200)).toBe(25);
  });

  it('returns -33 for ~33% decline', () => {
    expect(pctDelta(1000, 1500)).toBe(-33);
  });

  it('returns 0 when previous is 0 (undefined delta)', () => {
    expect(pctDelta(1000, 0)).toBe(0);
  });

  it('returns 100 for doubling', () => {
    expect(pctDelta(2000, 1000)).toBe(100);
  });

  it('returns -100 when current is 0', () => {
    expect(pctDelta(0, 1000)).toBe(-100);
  });
});
