'use client';

/**
 * LiveClock — live digital clock in HH:MM:SS:cs format (centiseconds, 0–99).
 *
 * Updates every 10ms via setInterval. Timezone label is derived from the
 * browser's Intl API — never hardcoded. Formatted as e.g. "PH Manila" by
 * extracting the last segment of the IANA timezone identifier and prepending
 * the country/region code.
 *
 * Examples:
 *   Asia/Manila   → "PH Manila"
 *   America/New_York → "America New_York"   (fallback format)
 *   UTC           → "UTC"
 */

import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface LiveClockProps {
  className?: string;
}

/** Format a Date into HH:MM:SS:cs where cs = Math.floor(ms / 10). */
function formatClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const cs = String(Math.floor(d.getMilliseconds() / 10)).padStart(2, '0');
  return `${hh}:${mm}:${ss}:${cs}`;
}

/**
 * Derive a short timezone label from the IANA timezone string.
 *
 * Strategy:
 *  1. Resolve IANA tz from Intl.DateTimeFormat().resolvedOptions().timeZone
 *  2. Split on "/"
 *  3. If format is "Region/City" → map known regions to 2-letter codes,
 *     otherwise use the region as-is + the city portion
 *  4. If just "UTC" or similar one-segment tz → return it as-is
 *
 * Examples:
 *   "Asia/Manila"      → "PH Manila"
 *   "America/New_York" → "US New_York"
 *   "Europe/London"    → "EU London"
 *   "UTC"              → "UTC"
 */
const REGION_CODE: Record<string, string> = {
  Asia: 'AS',
  America: 'US',
  Europe: 'EU',
  Africa: 'AF',
  Pacific: 'PC',
  Atlantic: 'AT',
  Indian: 'IN',
  Arctic: 'AR',
  Antarctica: 'AN',
  Australia: 'AU',
};

// Special-case cities to their country code for known IANA zones
const CITY_COUNTRY: Record<string, string> = {
  Manila: 'PH',
  Tokyo: 'JP',
  Seoul: 'KR',
  Shanghai: 'CN',
  Kolkata: 'IN',
  Dubai: 'AE',
  London: 'GB',
  Paris: 'FR',
  Berlin: 'DE',
  Moscow: 'RU',
  Sydney: 'AU',
  Auckland: 'NZ',
  Toronto: 'CA',
  Chicago: 'US',
  Denver: 'US',
  Phoenix: 'US',
  Los_Angeles: 'US',
  New_York: 'US',
  Sao_Paulo: 'BR',
  Johannesburg: 'ZA',
  Cairo: 'EG',
  Lagos: 'NG',
  Bangkok: 'TH',
  Jakarta: 'ID',
  Singapore: 'SG',
  Kuala_Lumpur: 'MY',
  Karachi: 'PK',
  Dhaka: 'BD',
  Colombo: 'LK',
  Kathmandu: 'NP',
  Yangon: 'MM',
  Taipei: 'TW',
  Hong_Kong: 'HK',
};

function deriveTimezoneLabel(tz: string): string {
  const parts = tz.split('/');
  if (parts.length === 1) return tz; // e.g. "UTC"

  const region = parts[0];
  // City may itself contain slashes (e.g. America/Indiana/Indianapolis) — use the last segment
  const city = parts[parts.length - 1];

  const countryCode = CITY_COUNTRY[city] ?? REGION_CODE[region] ?? region;
  return `${countryCode} ${city.replace(/_/g, ' ')}`;
}

export function LiveClock({ className }: LiveClockProps) {
  // SSR-safe: start with null, populate on client after mount
  const [display, setDisplay] = useState<string | null>(null);
  const [tzLabel, setTzLabel] = useState<string>('');

  useEffect(() => {
    // Resolve timezone once on mount
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTzLabel(deriveTimezoneLabel(tz));

    // Tick every 10ms for centisecond precision
    const id = setInterval(() => {
      setDisplay(formatClock(new Date()));
    }, 10);

    // Set initial value immediately (avoid 10ms blank flash)
    setDisplay(formatClock(new Date()));

    return () => clearInterval(id);
  }, []);

  if (display === null) {
    // Server render / hydration placeholder — same character width to prevent layout shift
    return (
      <div className={cn('flex flex-col items-start', className)}>
        <span
          className="tabular font-display text-muted leading-none"
          style={{ fontSize: '20px', fontWeight: 300, letterSpacing: '0.06em' }}
          aria-label="Clock loading"
        >
          --:--:--:--
        </span>
        <span
          className="mt-1 font-body uppercase text-muted"
          style={{ fontSize: '11px', letterSpacing: '0.18em' }}
          aria-hidden="true"
        >
          &nbsp;
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-start', className)}>
      <span
        className="tabular font-display text-muted leading-none"
        style={{ fontSize: '20px', fontWeight: 300, letterSpacing: '0.06em' }}
        aria-label={`Current time: ${display}`}
        aria-live="off"
      >
        {display}
      </span>
      {tzLabel && (
        <span
          className="mt-1 font-body uppercase text-muted"
          style={{ fontSize: '11px', letterSpacing: '0.18em' }}
          aria-label={`Timezone: ${tzLabel}`}
        >
          {tzLabel}
        </span>
      )}
    </div>
  );
}
