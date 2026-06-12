/**
 * packages/logs-ingest/src/lib/money.ts
 *
 * PHP amount parsing for the logs-ingest pipeline.
 *
 * Per hud-money skill: amounts MUST be signed INTEGER centavos. No floats.
 * This is the ONLY place in the pipeline allowed to call Number() on a
 * monetary string. Parsers call parsePhpAmount() — never inline parseFloat.
 *
 * Examples:
 *   parsePhpAmount('₱49,878.59')  → 4987859
 *   parsePhpAmount('-₱315.95')    → -31595
 *   parsePhpAmount('₱1,504.05')   → 150405
 *   parsePhpAmount('1504.05')     → 150405
 */

/**
 * Parse a PHP amount string from an Airbnb email into signed centavo INTEGER.
 *
 * Strips: ₱ symbol, 'PHP' label, commas, surrounding whitespace.
 * Preserves the leading minus sign for negative values.
 *
 * Throws:
 *   - RangeError if the input is empty after cleaning
 *   - RangeError if the resulting number is not finite
 *   - RangeError if the centavo value exceeds Number.MAX_SAFE_INTEGER
 */
export function parsePhpAmount(input: string): number {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new RangeError(`parsePhpAmount: empty or non-string input: ${JSON.stringify(input)}`);
  }

  // Preserve leading minus before stripping currency symbols
  const negative = input.trim().startsWith('-');

  const cleaned = input
    .replace(/PHP/gi, '') // strip 'PHP' label (case-insensitive)
    .replace(/₱/g, '') // strip peso sign
    .replace(/,/g, '') // strip thousands separators
    .replace(/-/g, '') // remove minus (re-applied below)
    .trim();

  if (cleaned === '') {
    throw new RangeError(`parsePhpAmount: empty after cleaning "${input}"`);
  }

  const value = Number(cleaned) * (negative ? -1 : 1);

  if (!Number.isFinite(value)) {
    throw new RangeError(`parsePhpAmount: non-finite result for "${input}"`);
  }

  const minor = Math.round(value * 100);

  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`parsePhpAmount: value exceeds safe integer range for "${input}"`);
  }

  return minor;
}
