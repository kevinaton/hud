/**
 * parsers/airbnb/cancellation.v1.ts
 *
 * Parses Airbnb "Canceled: Reservation" emails.
 *
 * Sample subject: "Canceled: Reservation HM8NAAMTHH for Jun 13 – 14, 2026"
 *
 * Key fields extracted:
 *   - confirmationCode  ("HM8NAAMTHH")
 *   - listingId         ("977049623688034712")
 *   - listingName
 *   - dateRangeStart / dateRangeEnd (ISO-8601 +08:00)
 *   - guestName
 *
 * Per blueprint: brittle selectors live as NAMED CONSTANTS below.
 * No money parsing in cancellation emails — those amounts stay projected.
 */

import type { ParseInput, ParseResult, Parser } from '../registry.js';

// ---------------------------------------------------------------------------
// Named selector constants
// ---------------------------------------------------------------------------

/** Subject pattern for cancellation emails */
const SUBJECT_PATTERN = /^canceled?:/i;

/** Confirmation code from subject or body */
const CONFIRMATION_CODE_SUBJECT_RE = /Canceled?:\s+Reservation\s+([A-Z0-9]{10})/i;

/** Confirmation code anywhere in body */
const CONFIRMATION_CODE_BODY_RE = /\b(HM[A-Z0-9]{8})\b/;

/** Listing ID (numeric, long) */
const LISTING_ID_RE = /\b(\d{15,20})\b/;

/** Date range: "Jun 13 – 14, 2026" or "Jun 13 - Jun 14, 2026" */
const DATE_RANGE_RE = /([A-Za-z]+\.?\s+\d{1,2})\s*[–\-]\s*(?:[A-Za-z]+\.?\s+)?(\d{1,2},?\s*\d{4})/i;

/** Date range with year on both: "4/17/2026 - 4/19/2026" */
const DATE_RANGE_MDY_RE = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/;

/** Guest name in body */
const GUEST_NAME_RE = /guest[:\s]+([A-Za-z][^\n\r]{2,50})/i;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
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

function parseMonthDay(raw: string, year: number): string | null {
  const m = raw.trim().match(/([A-Za-z]+)\.?\s+(\d{1,2})/);
  if (!m) return null;
  const monthKey = (m[1] ?? '').toLowerCase().slice(0, 3);
  const month = MONTH_NAMES[monthKey];
  const day = Number(m[2]);
  if (!month || !day) return null;
  return isoDate(year, month, day);
}

function parseMdy(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return isoDate(Number(m[3]), Number(m[1]), Number(m[2]));
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+08:00`;
}

// ---------------------------------------------------------------------------
// Parser implementation
// ---------------------------------------------------------------------------

function parse(input: ParseInput): ParseResult {
  const body = input.bodyText || input.bodyHtml || '';
  const contextYear = new Date().getFullYear();

  // Confirmation code — prefer subject extraction
  let confirmationCode: string | null = null;
  const subjectMatch = input.subject.match(CONFIRMATION_CODE_SUBJECT_RE);
  if (subjectMatch) {
    confirmationCode = (subjectMatch[1] ?? '').toUpperCase();
  } else {
    const bodyMatch = body.match(CONFIRMATION_CODE_BODY_RE);
    if (bodyMatch) confirmationCode = (bodyMatch[1] ?? '').toUpperCase();
  }

  if (!confirmationCode) {
    return { error: 'confirmation_code_not_found' };
  }

  // Listing ID (long numeric)
  let listingId: string | null = null;
  const listingMatch = body.match(LISTING_ID_RE);
  if (listingMatch) listingId = listingMatch[1] ?? null;

  // Guest name
  let guestName: string | null = null;
  const guestMatch = body.match(GUEST_NAME_RE);
  if (guestMatch) guestName = (guestMatch[1] ?? '').trim();

  // Date range
  let dateRangeStart: string | null = null;
  let dateRangeEnd: string | null = null;

  // Try MDY format first: 4/17/2026 - 4/19/2026
  const mdyMatch = body.match(DATE_RANGE_MDY_RE) ?? input.subject.match(DATE_RANGE_MDY_RE);
  if (mdyMatch) {
    dateRangeStart = parseMdy(mdyMatch[1] ?? '');
    dateRangeEnd = parseMdy(mdyMatch[2] ?? '');
  } else {
    // Try "Jun 13 – 14, 2026" from subject or body
    const rangeMatch = input.subject.match(DATE_RANGE_RE) ?? body.match(DATE_RANGE_RE);
    if (rangeMatch) {
      const startRaw = rangeMatch[1] ?? '';
      const endRaw = rangeMatch[2] ?? '';
      // endRaw contains "14, 2026" — extract year from it
      const yearMatch = endRaw.match(/(\d{4})/);
      const year = yearMatch ? Number(yearMatch[1]) : contextYear;
      dateRangeStart = parseMonthDay(startRaw, year);
      // endRaw: "14, 2026" → just day + year
      const endDayMatch = endRaw.match(/(\d{1,2}),?\s*(\d{4})/);
      if (endDayMatch && dateRangeStart) {
        // Get month from start
        const startMonthMatch = startRaw.match(/([A-Za-z]+)/);
        const monthKey = (startMonthMatch?.[1] ?? '').toLowerCase().slice(0, 3);
        const month = MONTH_NAMES[monthKey];
        if (month) {
          dateRangeEnd = isoDate(Number(endDayMatch[2]), month, Number(endDayMatch[1]));
        }
      }
    }
  }

  return {
    data: {
      confirmationCode,
      listingId,
      guestName,
      dateRangeStart,
      dateRangeEnd,
      status: 'canceled',
    },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const cancellationParserV1: Parser = {
  version: 'airbnb.cancellation@1',
  match: (sender: string, subject: string) =>
    sender.includes('airbnb.com') && SUBJECT_PATTERN.test(subject),
  parse,
};
