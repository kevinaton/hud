import { describe, expect, it } from 'vitest';
import { formatMoney } from '../format';

describe('formatMoney', () => {
  it('formats large amounts without decimals (>= 7 integer digits)', () => {
    // 12,599,959,700 minor → 125,999,597.00 major → 9 integer digits → no decimals
    expect(formatMoney(12599959700, 'PHP')).toBe('P125,999,597');
  });

  it('formats amounts with 2 decimals (< 7 integer digits)', () => {
    // 19,293,845 minor → 192,938.45 major → 6 integer digits → 2 decimals
    expect(formatMoney(19293845, 'PHP')).toBe('P192,938.45');
  });

  it('formats negative amounts', () => {
    // -28,000 minor → -280.00 → negative prefix
    expect(formatMoney(-28000, 'PHP')).toBe('-P280.00');
  });

  it('formats zero', () => {
    expect(formatMoney(0, 'PHP')).toBe('P0.00');
  });

  it('formats small amounts', () => {
    // 100 minor → 1.00 major
    expect(formatMoney(100, 'PHP')).toBe('P1.00');
  });

  it('uses ISO code as symbol for unknown currencies', () => {
    expect(formatMoney(10000, 'USD')).toBe('USD100.00');
  });
});
