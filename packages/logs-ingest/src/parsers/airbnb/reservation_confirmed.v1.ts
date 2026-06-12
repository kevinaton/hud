/**
 * parsers/airbnb/reservation_confirmed.v1.ts
 *
 * Parses Airbnb "Reservation confirmed" emails.
 *
 * Sample subject: "Reservation confirmed - <Guest> arrives <date>"
 *
 * Key fields extracted:
 *   - confirmationCode  ("HMJ9JX4ZYZ")
 *   - guestName
 *   - checkIn / checkOut (ISO-8601 with +08:00 offset)
 *   - nights
 *   - guestsCount
 *   - grossTotalMinor   (guest paid total)
 *   - cleaningFeeMinor
 *   - hostServiceFeeMinor (signed negative)
 *   - projectedEarningMinor ("You earn ₱X")
 *
 * Per blueprint: brittle selectors live as NAMED CONSTANTS below.
 * Per hud-money: all amounts via parsePhpAmount — never inline float.
 */

import { parsePhpAmount } from '../../lib/money.js';
import type { ParseInput, ParseResult, Parser } from '../registry.js';

// ---------------------------------------------------------------------------
// Named selector constants — update here when Airbnb changes the template
// ---------------------------------------------------------------------------

/** Subject pattern for reservation confirmed emails */
const SUBJECT_PATTERN = /^reservation confirmed/i;

/** Sender domain for Airbnb automated emails */
const SENDER_DOMAIN = 'airbnb.com';

/** Regex to extract confirmation code from the body */
const CONFIRMATION_CODE_RE = /Confirmation\s+code\s*[:\s]+([A-Z0-9]{10})/i;

/** Alternative: code in subject or URL path */
const CONFIRMATION_CODE_ALT_RE = /\b(HM[A-Z0-9]{8})\b/;

/** Regex to extract "You earn ₱X" projected earning */
const YOU_EARN_RE = /You\s+earn\s+([\-₱PHP0-9,. ]+)/i;

/** Regex to extract total paid by guest */
const TOTAL_PAID_RE = /Total\s+paid\s*[:\s]*([\-₱PHP0-9,. ]+)/i;

/** Regex to extract cleaning fee */
const CLEANING_FEE_RE = /Cleaning\s+fee\s*[:\s]*([\-₱PHP0-9,. ]+)/i;

/** Regex to extract host service fee (may be negative) */
const HOST_SERVICE_FEE_RE = /(?:Airbnb\s+)?service\s+fee\s*[:\s]*([\-₱PHP0-9,. ]+)/i;

/** Regex for check-in date */
const CHECK_IN_RE = /Check-?in\s*[:\s]+([A-Za-z]+,?\s+[A-Za-z]+\.?\s+\d{1,2}(?:,?\s+\d{4})?)/i;

/** Regex for check-out date */
const CHECK_OUT_RE = /Check-?out\s*[:\s]+([A-Za-z]+,?\s+[A-Za-z]+\.?\s+\d{1,2}(?:,?\s+\d{4})?)/i;

/** Regex for number of nights */
const NIGHTS_RE = /(\d+)\s+night/i;

/** Regex for guest count */
const GUESTS_RE = /(\d+)\s+guest/i;

/** Regex for guest name from subject "arrives" pattern */
const GUEST_FROM_SUBJECT_RE = /reservation confirmed\s*-\s*(.+?)\s+arrives/i;

// ---------------------------------------------------------------------------
// Date parser
// ---------------------------------------------------------------------------

/**
 * Parse an Airbnb date string into ISO-8601 with Asia/Manila (+08:00) offset.
 * Formats encountered: "Sat, Jun 13", "Jun 13", "Jun 13, 2026", "4/17/2026"
 * Year is resolved from the provided context year.
 */
function parseAirbnbDate(raw: string, contextYear: number): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();

  // Try ISO-like formats first: 4/17/2026
  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return isoDate(Number(y), Number(m), Number(d));
  }

  // Month name formats: "Sat, Jun 13, 2026" | "Jun 13, 2026" | "Jun 13"
  const monthNames: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  const monthRe =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/i;
  const m = trimmed.match(monthRe);
  if (m) {
    const monthKey = (m[1] ?? '').toLowerCase().slice(0, 3) as keyof typeof monthNames;
    const month = monthNames[monthKey];
    const day = Number(m[2]);
    const year = m[3] ? Number(m[3]) : contextYear;
    if (month && day) return isoDate(year, month, day);
  }

  return null;
}

function isoDate(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}T00:00:00+08:00`;
}

// ---------------------------------------------------------------------------
// Parser implementation
// ---------------------------------------------------------------------------

function parse(input: ParseInput): ParseResult {
  const body = input.bodyText || input.bodyHtml || '';

  if (!body) {
    return { error: 'empty body' };
  }

  // Confirmation code
  let confirmationCode: string | null = null;
  const ccMatch = body.match(CONFIRMATION_CODE_RE) ?? body.match(CONFIRMATION_CODE_ALT_RE);
  if (ccMatch) confirmationCode = (ccMatch[1] ?? '').toUpperCase();

  if (!confirmationCode) {
    return { error: 'confirmation_code_not_found' };
  }

  // Context year from subject or fallback to current year
  const contextYear = new Date().getFullYear();

  // Guest name from subject
  let guestName: string | null = null;
  const guestMatch = input.subject.match(GUEST_FROM_SUBJECT_RE);
  if (guestMatch) guestName = (guestMatch[1] ?? '').trim();

  // Dates
  let checkIn: string | null = null;
  let checkOut: string | null = null;
  const checkInMatch = body.match(CHECK_IN_RE);
  if (checkInMatch) checkIn = parseAirbnbDate(checkInMatch[1] ?? '', contextYear);
  const checkOutMatch = body.match(CHECK_OUT_RE);
  if (checkOutMatch) checkOut = parseAirbnbDate(checkOutMatch[1] ?? '', contextYear);

  // Nights
  let nights: number | null = null;
  const nightsMatch = body.match(NIGHTS_RE);
  if (nightsMatch) nights = Number(nightsMatch[1]);

  // Guests
  let guestsCount: number | null = null;
  const guestsMatch = body.match(GUESTS_RE);
  if (guestsMatch) guestsCount = Number(guestsMatch[1]);

  // Money amounts — all via parsePhpAmount per hud-money skill
  let grossTotalMinor: number | null = null;
  let cleaningFeeMinor: number | null = null;
  let hostServiceFeeMinor: number | null = null;
  let projectedEarningMinor: number | null = null;

  try {
    const totalMatch = body.match(TOTAL_PAID_RE);
    if (totalMatch?.[1]) grossTotalMinor = parsePhpAmount(totalMatch[1]);
  } catch {
    /* field absent — not an error */
  }

  try {
    const cleaningMatch = body.match(CLEANING_FEE_RE);
    if (cleaningMatch?.[1]) cleaningFeeMinor = parsePhpAmount(cleaningMatch[1]);
  } catch {
    /* field absent */
  }

  try {
    const feeMatch = body.match(HOST_SERVICE_FEE_RE);
    if (feeMatch?.[1]) hostServiceFeeMinor = parsePhpAmount(feeMatch[1]);
  } catch {
    /* field absent */
  }

  try {
    const earnMatch = body.match(YOU_EARN_RE);
    if (earnMatch?.[1]) {
      projectedEarningMinor = parsePhpAmount(earnMatch[1]);
    }
  } catch (err) {
    return { error: `projected_earning_parse_failed: ${String(err)}` };
  }

  if (projectedEarningMinor === null) {
    return { error: 'projected_earning_not_found' };
  }

  return {
    data: {
      confirmationCode,
      guestName,
      checkIn,
      checkOut,
      nights,
      guestsCount,
      grossTotalMinor,
      cleaningFeeMinor,
      hostServiceFeeMinor,
      projectedEarningMinor,
    },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const reservationConfirmedParserV1: Parser = {
  version: 'airbnb.reservation_confirmed@1',
  match: (sender: string, subject: string) =>
    sender.includes(SENDER_DOMAIN) && SUBJECT_PATTERN.test(subject),
  parse,
};
