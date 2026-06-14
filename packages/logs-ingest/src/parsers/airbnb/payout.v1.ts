/**
 * parsers/airbnb/payout.v1.ts
 *
 * Parses Airbnb payout emails.
 *
 * Sample subject: "We sent a payout of ₱49,878.59 PHP"
 *
 * Key fields extracted:
 *   - payoutTotal (₱49,878.59 → 4987859 centavos)
 *   - sentDate (ISO-8601 +08:00)
 *   - expectedArrivalDate
 *   - bankAccountLabel ("Kevin Aton, 4131 (PHP)")
 *   - airbnbAccountId ("39777780")
 *   - items: Array of { confirmationCode, guestName, amountMinor, dateRangeStart, dateRangeEnd }
 *
 * Assertion: SUM(items.amountMinor) must equal payoutTotalMinor.
 * If not → { error: 'items_sum_mismatch' } — entry marked parse_failed.
 *
 * Per blueprint: brittle selectors as NAMED CONSTANTS.
 * Per hud-money: all amounts via parsePhpAmount — no inline floats.
 */

import { parsePhpAmount } from '../../lib/money.js';
import type { ParseInput, ParseResult, Parser } from '../registry.js';

// ---------------------------------------------------------------------------
// Named selector constants
// ---------------------------------------------------------------------------

/** Subject pattern for payout emails */
const SUBJECT_PATTERN = /we sent a payout/i;

/** Total payout amount in subject */
const SUBJECT_TOTAL_RE = /we sent a payout of\s+([\-₱PHP0-9,. ]+)/i;

/** Total payout in body (may appear differently) */
const BODY_TOTAL_RE = /(?:total\s+payout|payout\s+(?:of|total))\s*[:\s]*([\-₱PHP0-9,. ]+)/i;

/** Sent date patterns */
const SENT_DATE_RE = /(?:Sent|Transfer\s+date)\s*[:\s]+([A-Za-z]+\.?\s+\d{1,2},?\s*\d{4})/i;

/** Expected arrival date */
const ARRIVAL_DATE_RE =
  /(?:Expected\s+)?arrival\s+(?:date\s*)?[:\s]+([A-Za-z]+\.?\s+\d{1,2},?\s*\d{4})/i;

/** Bank account label pattern */
const BANK_RE = /(?:To|Account)\s*[:\s]+([^\n\r]{5,80})/i;

/** Airbnb account ID */
const ACCOUNT_ID_RE = /Airbnb\s+(?:account\s+ID|ID)\s*[:\s]+(\d{5,12})/i;

/** Per-item: confirmation code */
const ITEM_CODE_RE = /\b(HM[A-Z0-9]{8})\b/g;

/** Per-item: amount (may appear near or after the code) */
const ITEM_AMOUNT_RE = /\b(HM[A-Z0-9]{8})\b[^\n]*?\n(?:[^\n]*?\n){0,5}?([\-₱PHP0-9,. ]+)/g;

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

function parseNamedDate(raw: string): string | null {
  const m = raw.trim().match(/([A-Za-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})/);
  if (!m) return null;
  const monthKey = (m[1] ?? '').toLowerCase().slice(0, 3);
  const month = MONTH_NAMES[monthKey];
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!month || !day || !year) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+08:00`;
}

// ---------------------------------------------------------------------------
// Item extraction
//
// Each payout item looks something like (in plain text):
//   HMJ9JX4ZYZ
//   Guest: Someone
//   Jun 13 – Jun 14, 2026
//   ₱15,040.50
//
// Strategy: find all confirmation codes, then scan the following lines for
// the amount and date range for each.
// ---------------------------------------------------------------------------

interface PayoutItem {
  confirmationCode: string;
  guestName: string | null;
  amountMinor: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
}

function extractItems(body: string): PayoutItem[] | { error: string } {
  const items: PayoutItem[] = [];

  const codeRe = /\b(HM[A-Z0-9]{8})\b/g;
  const codePositions: Array<{ code: string; index: number; end: number }> = [];
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
  while ((m = codeRe.exec(body)) !== null) {
    codePositions.push({ code: m[1] ?? '', index: m.index, end: m.index + m[0].length });
  }

  if (codePositions.length === 0) {
    return { error: 'no_items_found' };
  }

  for (let i = 0; i < codePositions.length; i++) {
    const pos = codePositions[i];
    if (!pos) continue;
    const prevPos = codePositions[i - 1];

    // Real Airbnb payout emails place details BEFORE the HM code in each block:
    //   {Guest Name}   ₱{Amount} PHP
    //   Home • {M/D/YYYY} - {M/D/YYYY}
    //   {Property} ({listingId})
    //   {HM code}
    // Scanning backward (prev code end → current code end) puts the guest name
    // and amount inside their own item's section instead of the next item's.
    const sectionStart = prevPos ? prevPos.end : 0;
    const sectionEnd = pos.end;
    const section = body.slice(sectionStart, sectionEnd);

    const code = pos.code.toUpperCase();

    // Guest name — inline "Name   ₱Amount" format (multiple horizontal spaces)
    let guestName: string | null = null;
    const inlineGuestMatch = section.match(/^([A-Za-z][^\n\r]*?)[^\S\n]{2,}[₱\-]/m);
    if (inlineGuestMatch) {
      guestName = (inlineGuestMatch[1] ?? '').trim();
    }
    // Fallback: "Guest: Name" format
    if (!guestName) {
      const kwMatch = section.match(/guest[:\s]+([A-Za-z][^\n\r]{1,50})/i);
      if (kwMatch) guestName = (kwMatch[1] ?? '').trim();
    }

    // Amount — prefer inline pattern: multiple horizontal spaces before ₱
    // disambiguates item amounts from standalone totals in the preamble
    let amountMinor: number | null = null;
    const inlineAmountMatch = section.match(/[^\S\n]{2,}(₱[\d,]+\.\d{2})/);
    if (inlineAmountMatch?.[1]) {
      try {
        amountMinor = parsePhpAmount(inlineAmountMatch[1]);
      } catch {
        // fall through
      }
    }
    // Fallback: first ₱ amount anywhere in section
    if (amountMinor === null) {
      const amountMatches = section.match(/([₱\-][\-₱PHP0-9,. ]+(?:\d{2}))/g);
      if (amountMatches) {
        for (const raw of amountMatches) {
          try {
            amountMinor = parsePhpAmount(raw);
            break;
          } catch {
            /* try next */
          }
        }
      }
    }

    if (amountMinor === null) {
      return { error: `amount_not_found_for_code_${code}` };
    }

    // Date range — numeric M/D/YYYY (real emails) or named-month format (legacy)
    let dateRangeStart: string | null = null;
    let dateRangeEnd: string | null = null;

    const numericMatch = section.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    );
    if (numericMatch) {
      const [, sm, sd, sy, em, ed, ey] = numericMatch;
      const pad2 = (s: string | undefined) => String(Number(s ?? '1')).padStart(2, '0');
      dateRangeStart = `${sy}-${pad2(sm)}-${pad2(sd)}T00:00:00+08:00`;
      dateRangeEnd = `${ey}-${pad2(em)}-${pad2(ed)}T00:00:00+08:00`;
    } else {
      const rangeRe = /([A-Za-z]+\.?\s+\d{1,2})\s*[–\-]\s*(?:[A-Za-z]+\.?\s+)?(\d{1,2},?\s*\d{4})/;
      const rangeMatch = section.match(rangeRe);
      if (rangeMatch) {
        const startRaw = rangeMatch[1] ?? '';
        const endRaw = rangeMatch[2] ?? '';
        const yearMatch = endRaw.match(/(\d{4})/);
        const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
        const startMonthMatch = startRaw.match(/([A-Za-z]+)/);
        const monthKey = (startMonthMatch?.[1] ?? '').toLowerCase().slice(0, 3);
        const month = MONTH_NAMES[monthKey];
        const startDayMatch = startRaw.match(/(\d{1,2})$/);
        const startDay = startDayMatch ? Number(startDayMatch[1]) : null;
        if (month && startDay) {
          dateRangeStart = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}T00:00:00+08:00`;
        }
        const endDayMatch = endRaw.match(/^(\d{1,2})/);
        if (month && endDayMatch) {
          dateRangeEnd = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Number(endDayMatch[1])).padStart(2, '0')}T00:00:00+08:00`;
        }
      }
    }

    items.push({ confirmationCode: code, guestName, amountMinor, dateRangeStart, dateRangeEnd });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Parser implementation
// ---------------------------------------------------------------------------

function parse(input: ParseInput): ParseResult {
  const body = input.bodyText || '';
  if (!body) {
    return { error: 'empty_body' };
  }

  // Payout total — try subject first, then body
  let payoutTotalMinor: number;
  try {
    const subjectMatch = input.subject.match(SUBJECT_TOTAL_RE);
    if (subjectMatch?.[1]) {
      payoutTotalMinor = parsePhpAmount(subjectMatch[1]);
    } else {
      const bodyMatch = body.match(BODY_TOTAL_RE);
      if (!bodyMatch?.[1]) {
        return { error: 'payout_total_not_found' };
      }
      payoutTotalMinor = parsePhpAmount(bodyMatch[1]);
    }
  } catch (err) {
    return { error: `payout_total_parse_failed: ${String(err)}` };
  }

  // Dates
  let sentDate: string | null = null;
  let expectedArrivalDate: string | null = null;
  const sentMatch = body.match(SENT_DATE_RE);
  if (sentMatch?.[1]) sentDate = parseNamedDate(sentMatch[1]);
  const arrivalMatch = body.match(ARRIVAL_DATE_RE);
  if (arrivalMatch?.[1]) expectedArrivalDate = parseNamedDate(arrivalMatch[1]);

  // Bank account
  let bankAccountLabel: string | null = null;
  const bankMatch = body.match(BANK_RE);
  if (bankMatch?.[1]) bankAccountLabel = bankMatch[1].trim();

  // Airbnb account ID
  let airbnbAccountId: string | null = null;
  const accountMatch = body.match(ACCOUNT_ID_RE);
  if (accountMatch?.[1]) airbnbAccountId = accountMatch[1];

  // Per-reservation items
  const itemsResult = extractItems(body);
  if ('error' in itemsResult) {
    return { error: itemsResult.error };
  }

  // ASSERTION: items must sum to payout total
  const itemsSum = itemsResult.reduce((sum, item) => sum + item.amountMinor, 0);
  if (itemsSum !== payoutTotalMinor) {
    return {
      error: `items_sum_mismatch: expected ${payoutTotalMinor} got ${itemsSum}`,
    };
  }

  return {
    data: {
      payoutTotalMinor,
      sentDate,
      expectedArrivalDate,
      bankAccountLabel,
      airbnbAccountId,
      items: itemsResult,
    },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const payoutParserV1: Parser = {
  version: 'airbnb.payout@1',
  match: (sender: string, subject: string) =>
    sender.includes('airbnb.com') && SUBJECT_PATTERN.test(subject),
  parse,
};
