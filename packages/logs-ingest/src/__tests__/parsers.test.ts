/**
 * packages/logs-ingest/src/__tests__/parsers.test.ts
 *
 * Vitest tests for the three Airbnb email parsers against fixtures.
 *
 * Per blueprint success criteria:
 *   - reservation_confirmed: HMJ9JX4ZYZ, projectedEarningMinor=150405, hostServiceFeeMinor=-31595
 *   - cancellation: HM8NAAMTHH, status='canceled', listingId='977049623688034712'
 *   - payout: payoutTotalMinor=4987859, items sum to total, all amounts as centavo integers
 *
 * Per hud-money skill: all assertions use integer centavos.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cancellationParserV1 } from '../parsers/airbnb/cancellation.v1.js';
import { payoutParserV1 } from '../parsers/airbnb/payout.v1.js';
import { reservationConfirmedParserV1 } from '../parsers/airbnb/reservation_confirmed.v1.js';
import { classifyEntry } from '../classify.js';
import { getRegistry } from '../parsers/registry.js';

const FIXTURES = join(import.meta.dirname ?? __dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// reservation_confirmed.v1
// ---------------------------------------------------------------------------

describe('reservation_confirmed.v1', () => {
  const fixture = loadFixture('reservation_confirmed.txt');
  // Body is everything after the headers
  const body = fixture.split('\n\n').slice(1).join('\n\n');

  it('matches the correct sender and subject', () => {
    expect(
      reservationConfirmedParserV1.match(
        'automated@airbnb.com',
        'Reservation confirmed - John Smith arrives Jun 13',
      ),
    ).toBe(true);
  });

  it('does not match cancellation emails', () => {
    expect(
      reservationConfirmedParserV1.match(
        'automated@airbnb.com',
        'Canceled: Reservation HM8NAAMTHH',
      ),
    ).toBe(false);
  });

  it('extracts confirmation code HMJ9JX4ZYZ', () => {
    const result = reservationConfirmedParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'Reservation confirmed - John Smith arrives Jun 13',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      expect(result.data.confirmationCode).toBe('HMJ9JX4ZYZ');
    }
  });

  it('extracts projectedEarningMinor = 150405 (₱1,504.05)', () => {
    const result = reservationConfirmedParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'Reservation confirmed - John Smith arrives Jun 13',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      // ₱1,504.05 → 150405 centavos
      expect(result.data.projectedEarningMinor).toBe(150405);
    }
  });

  it('extracts hostServiceFeeMinor = -31595 (-₱315.95)', () => {
    const result = reservationConfirmedParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'Reservation confirmed - John Smith arrives Jun 13',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      // -₱315.95 → -31595 centavos
      expect(result.data.hostServiceFeeMinor).toBe(-31595);
    }
  });

  it('extracts grossTotalMinor = 250000 (₱2,500.00)', () => {
    const result = reservationConfirmedParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'Reservation confirmed - John Smith arrives Jun 13',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      expect(result.data.grossTotalMinor).toBe(250000);
    }
  });

  it('extracts nights = 1 and guestsCount = 2', () => {
    const result = reservationConfirmedParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'Reservation confirmed - John Smith arrives Jun 13',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      expect(result.data.nights).toBe(1);
      expect(result.data.guestsCount).toBe(2);
    }
  });

  it('returns parse_failed when confirmation code is absent', () => {
    const result = reservationConfirmedParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'Reservation confirmed - Someone arrives',
      bodyText: 'No code here.',
      bodyHtml: '',
    });

    expect('error' in result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cancellation.v1
// ---------------------------------------------------------------------------

describe('cancellation.v1', () => {
  const fixture = loadFixture('cancellation.txt');
  const body = fixture.split('\n\n').slice(1).join('\n\n');

  it('matches the correct sender and subject', () => {
    expect(
      cancellationParserV1.match(
        'automated@airbnb.com',
        'Canceled: Reservation HM8NAAMTHH for Jun 13 – 14, 2026',
      ),
    ).toBe(true);
  });

  it('extracts confirmation code HM8NAAMTHH from subject', () => {
    const result = cancellationParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'Canceled: Reservation HM8NAAMTHH for Jun 13 – 14, 2026',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      expect(result.data.confirmationCode).toBe('HM8NAAMTHH');
    }
  });

  it('extracts listingId 977049623688034712', () => {
    const result = cancellationParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'Canceled: Reservation HM8NAAMTHH for Jun 13 – 14, 2026',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      expect(result.data.listingId).toBe('977049623688034712');
    }
  });

  it('sets status to canceled', () => {
    const result = cancellationParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'Canceled: Reservation HM8NAAMTHH for Jun 13 – 14, 2026',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      expect(result.data.status).toBe('canceled');
    }
  });
});

// ---------------------------------------------------------------------------
// payout.v1
// ---------------------------------------------------------------------------

describe('payout.v1', () => {
  const fixture = loadFixture('payout.txt');
  const body = fixture.split('\n\n').slice(1).join('\n\n');

  it('matches the correct sender and subject', () => {
    expect(payoutParserV1.match('automated@airbnb.com', 'We sent a payout of ₱49,878.59 PHP')).toBe(
      true,
    );
  });

  it('extracts payoutTotalMinor = 4987859 (₱49,878.59)', () => {
    const result = payoutParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'We sent a payout of ₱49,878.59 PHP',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      // ₱49,878.59 → 4987859 centavos
      expect(result.data.payoutTotalMinor).toBe(4987859);
    }
  });

  it('extracts items and their amounts as centavo integers', () => {
    const result = payoutParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'We sent a payout of ₱49,878.59 PHP',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      const items = result.data.items as Array<{ confirmationCode: string; amountMinor: number }>;
      expect(items).toHaveLength(3);

      // ₱1,504.05 → 150405
      const item1 = items.find((i) => i.confirmationCode === 'HMJ9JX4ZYZ');
      expect(item1?.amountMinor).toBe(150405);

      // ₱3,200.50 → 320050
      const item2 = items.find((i) => i.confirmationCode === 'HM9ABCDEFG');
      expect(item2?.amountMinor).toBe(320050);
    }
  });

  it('items sum equals payoutTotalMinor (4987859)', () => {
    const result = payoutParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'We sent a payout of ₱49,878.59 PHP',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      const items = result.data.items as Array<{ amountMinor: number }>;
      const sum = items.reduce((s, i) => s + i.amountMinor, 0);
      expect(sum).toBe(result.data.payoutTotalMinor);
    }
  });

  it('returns error when items sum does not match total', () => {
    const badBody = body.replace('₱49,878.59', '₱99,999.99');
    const result = payoutParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'We sent a payout of ₱99,999.99 PHP',
      bodyText: badBody,
      bodyHtml: '',
    });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/mismatch/);
    }
  });

  it('extracts bankAccountLabel', () => {
    const result = payoutParserV1.parse({
      sender: 'automated@airbnb.com',
      subject: 'We sent a payout of ₱49,878.59 PHP',
      bodyText: body,
      bodyHtml: '',
    });

    expect('error' in result).toBe(false);
    if ('data' in result) {
      expect(typeof result.data.bankAccountLabel).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

describe('classifyEntry', () => {
  const registry = getRegistry();

  it('classifies reservation_confirmed correctly', () => {
    expect(
      classifyEntry(
        'automated@airbnb.com',
        'Reservation confirmed - Someone arrives Jun 1',
        registry,
      ),
    ).toBe('airbnb.reservation_confirmed');
  });

  it('classifies cancellation correctly', () => {
    expect(
      classifyEntry('automated@airbnb.com', 'Canceled: Reservation HMXXXXXXXX', registry),
    ).toBe('airbnb.cancellation');
  });

  it('classifies payout correctly', () => {
    expect(classifyEntry('automated@airbnb.com', 'We sent a payout of ₱1,000 PHP', registry)).toBe(
      'airbnb.payout',
    );
  });

  it('returns null for unknown sender', () => {
    expect(
      classifyEntry('unknown@example.com', 'Reservation confirmed - Someone', registry),
    ).toBeNull();
  });

  it('returns null for unknown subject', () => {
    expect(
      classifyEntry('automated@airbnb.com', 'Weekly newsletter for you!', registry),
    ).toBeNull();
  });
});
