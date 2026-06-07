/**
 * Format an integer minor-unit amount into a display string.
 *
 * Rules:
 * - Divide by 100 to get major units.
 * - If the absolute value has >= 7 display digits (before decimal), show NO decimals.
 * - Otherwise show 2 decimal places.
 * - Currency prefix: PHP → "₱", others use the ISO code.
 *
 * Examples:
 *   formatMoney(12599959700, 'PHP')  → '₱125,999,597'   (no decimals, >= 7 digits)
 *   formatMoney(19293845, 'PHP')     → '₱192,938.45'    (2 decimals, < 7 digits)
 *   formatMoney(-28000, 'PHP')       → '-₱280.00'
 */

const CURRENCY_SYMBOL: Record<string, string> = {
  PHP: '₱',
};

function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOL[currency] ?? currency;
}

export function formatMoney(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  const absAmount = Math.abs(major);
  const sign = amountMinor < 0 ? '-' : '';
  const symbol = currencySymbol(currency);

  // Count integer digits to decide decimal treatment
  const integerPart = Math.floor(absAmount);
  const integerDigits = integerPart === 0 ? 1 : Math.floor(Math.log10(integerPart)) + 1;

  let formatted: string;
  if (integerDigits >= 7) {
    // No decimals for large numbers
    formatted = absAmount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } else {
    formatted = absAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return `${sign}${symbol}${formatted}`;
}
