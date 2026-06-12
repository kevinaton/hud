/**
 * packages/logs-ingest/src/__tests__/sentry-scrub.test.ts
 *
 * Unit tests for the Sentry beforeSend PII scrubbing hook.
 *
 * Per Ticket 55 AC:
 *   Sentry `beforeSend` must scrub `parsed_json`, `body_text`, `body_html`
 *   from all events — confirmed by these tests.
 *
 * Scrub is confirmed by checking that each of the three PII fields
 * is replaced with '[Scrubbed]' in the returned event, regardless of
 * where in the event they appear (extra, contexts, breadcrumb data).
 */

import { describe, expect, it } from 'vitest';
import { SCRUBBED_FIELDS, scrubBeforeSend, scrubObject } from '../lib/sentry.js';

// ---------------------------------------------------------------------------
// scrubObject tests
// ---------------------------------------------------------------------------

describe('scrubObject', () => {
  it('replaces parsed_json with [Scrubbed]', () => {
    const result = scrubObject({ parsed_json: '{"amount":150405}', other: 'keep' }) as Record<
      string,
      unknown
    >;
    expect(result.parsed_json).toBe('[Scrubbed]');
    expect(result.other).toBe('keep');
  });

  it('replaces body_text with [Scrubbed]', () => {
    const result = scrubObject({ body_text: 'Raw email body with PII' }) as Record<string, unknown>;
    expect(result.body_text).toBe('[Scrubbed]');
  });

  it('replaces body_html with [Scrubbed]', () => {
    const result = scrubObject({ body_html: '<html>email</html>' }) as Record<string, unknown>;
    expect(result.body_html).toBe('[Scrubbed]');
  });

  it('recurses into nested objects', () => {
    const result = scrubObject({
      outer: {
        inner: {
          parsed_json: 'secret data',
        },
      },
    }) as Record<string, unknown>;
    const inner = (result.outer as Record<string, unknown>).inner as Record<string, unknown>;
    expect(inner.parsed_json).toBe('[Scrubbed]');
  });

  it('recurses into arrays', () => {
    const result = scrubObject([{ body_text: 'secret', name: 'keep' }]) as Array<
      Record<string, unknown>
    >;
    expect(result[0].body_text).toBe('[Scrubbed]');
    expect(result[0].name).toBe('keep');
  });

  it('leaves non-PII fields untouched', () => {
    const result = scrubObject({
      confirmation_code: 'HMJ9JX4ZYZ',
      amount: 150405,
      ok: true,
    }) as Record<string, unknown>;
    expect(result.confirmation_code).toBe('HMJ9JX4ZYZ');
    expect(result.amount).toBe(150405);
    expect(result.ok).toBe(true);
  });

  it('handles null and undefined gracefully', () => {
    expect(scrubObject(null)).toBeNull();
    expect(scrubObject(undefined)).toBeUndefined();
  });

  it('covers all three SCRUBBED_FIELDS', () => {
    expect(SCRUBBED_FIELDS).toHaveLength(3);
    expect(SCRUBBED_FIELDS).toContain('parsed_json');
    expect(SCRUBBED_FIELDS).toContain('body_text');
    expect(SCRUBBED_FIELDS).toContain('body_html');
  });
});

// ---------------------------------------------------------------------------
// scrubBeforeSend tests
// ---------------------------------------------------------------------------

describe('scrubBeforeSend', () => {
  it('returns null when SENTRY_DSN is not set', () => {
    const original = process.env['SENTRY_DSN'];
    delete process.env['SENTRY_DSN'];

    const result = scrubBeforeSend({ message: 'test' });
    expect(result).toBeNull();

    if (original !== undefined) process.env['SENTRY_DSN'] = original;
  });

  it('scrubs parsed_json from event.extra when DSN is set', () => {
    process.env['SENTRY_DSN'] = 'https://test@sentry.io/123';

    const event = {
      message: 'test error',
      extra: {
        parsed_json: '{"confirmationCode":"HMJ9JX4ZYZ","projectedEarningMinor":150405}',
        other_field: 'not scrubbed',
      },
    };

    const result = scrubBeforeSend(event);
    expect(result).not.toBeNull();
    expect((result!.extra as Record<string, unknown>).parsed_json).toBe('[Scrubbed]');
    expect((result!.extra as Record<string, unknown>).other_field).toBe('not scrubbed');

    delete process.env['SENTRY_DSN'];
  });

  it('scrubs body_text from event.extra when DSN is set', () => {
    process.env['SENTRY_DSN'] = 'https://test@sentry.io/123';

    const event = {
      extra: { body_text: 'Raw email body with guest name and address' },
    };

    const result = scrubBeforeSend(event);
    expect(result).not.toBeNull();
    expect((result!.extra as Record<string, unknown>).body_text).toBe('[Scrubbed]');

    delete process.env['SENTRY_DSN'];
  });

  it('scrubs body_html from event.extra when DSN is set', () => {
    process.env['SENTRY_DSN'] = 'https://test@sentry.io/123';

    const event = {
      extra: { body_html: '<html><body>Confidential email content</body></html>' },
    };

    const result = scrubBeforeSend(event);
    expect(result).not.toBeNull();
    expect((result!.extra as Record<string, unknown>).body_html).toBe('[Scrubbed]');

    delete process.env['SENTRY_DSN'];
  });

  it('scrubs PII from breadcrumb data when DSN is set', () => {
    process.env['SENTRY_DSN'] = 'https://test@sentry.io/123';

    const event = {
      breadcrumbs: {
        values: [
          {
            message: 'parsed entry',
            data: {
              parsed_json: 'sensitive',
              body_text: 'also sensitive',
              ok: 'not sensitive',
            },
          },
        ],
      },
    };

    const result = scrubBeforeSend(event);
    expect(result).not.toBeNull();

    const breadcrumbs = result!.breadcrumbs as { values: Array<{ data: Record<string, unknown> }> };
    const crumbData = breadcrumbs.values[0].data;
    expect(crumbData.parsed_json).toBe('[Scrubbed]');
    expect(crumbData.body_text).toBe('[Scrubbed]');
    expect(crumbData.ok).toBe('not sensitive');

    delete process.env['SENTRY_DSN'];
  });

  it('does not mutate the original event', () => {
    process.env['SENTRY_DSN'] = 'https://test@sentry.io/123';

    const event = {
      extra: { parsed_json: 'original value' },
    };
    const originalJson = event.extra.parsed_json;

    scrubBeforeSend(event);

    // Original should be unchanged
    expect(event.extra.parsed_json).toBe(originalJson);

    delete process.env['SENTRY_DSN'];
  });
});
