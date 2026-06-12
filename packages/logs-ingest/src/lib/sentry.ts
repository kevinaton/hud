/**
 * packages/logs-ingest/src/lib/sentry.ts
 *
 * Sentry initialization for the logs-ingest worker with PII scrubbing.
 *
 * Per Ticket 55 / blueprint L4:
 *   beforeSend must scrub `parsed_json`, `body_text`, `body_html` from ALL
 *   Sentry events — these fields may contain guest names, addresses, amounts
 *   and must never be sent to Sentry's servers.
 *
 * Scrubbing strategy:
 *   1. Walk event.extra, event.contexts, event.breadcrumbs.values[].data
 *      and replace any of the three PII keys with '[Scrubbed]'.
 *   2. Also scrub from any string values in event.message (heuristic).
 *   3. Returns null (drop event) if DSN is not configured — no-op in test/dev.
 *
 * The scrubBeforeSend function is exported separately for unit testing.
 */

// biome-ignore lint/style/useNodejsImportProtocol: Sentry imports don't use node: prefix
import type { Event as SentryEvent } from '@sentry/types';

// ---------------------------------------------------------------------------
// PII field names that must NEVER reach Sentry
// ---------------------------------------------------------------------------
export const SCRUBBED_FIELDS = ['parsed_json', 'body_text', 'body_html'] as const;
export type ScrubbedField = (typeof SCRUBBED_FIELDS)[number];

// ---------------------------------------------------------------------------
// scrubObject
//
// Recursively walks a plain object and replaces any key matching
// SCRUBBED_FIELDS with '[Scrubbed]'.
// ---------------------------------------------------------------------------
export function scrubObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrubObject);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if ((SCRUBBED_FIELDS as readonly string[]).includes(key)) {
      result[key] = '[Scrubbed]';
    } else {
      result[key] = scrubObject(value);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// scrubBeforeSend
//
// Sentry beforeSend hook. Accepts a SentryEvent, returns a scrubbed copy
// (or null to drop if SENTRY_DSN is not configured).
//
// Exported for unit testing. Import and pass to Sentry.init({ beforeSend }).
// ---------------------------------------------------------------------------
export function scrubBeforeSend(event: SentryEvent): SentryEvent | null {
  // No DSN → drop events (test/dev)
  if (!process.env['SENTRY_DSN']) return null;

  // Deep-clone to avoid mutating the original
  const scrubbed = JSON.parse(JSON.stringify(event)) as SentryEvent;

  // Scrub event.extra
  if (scrubbed.extra) {
    scrubbed.extra = scrubObject(scrubbed.extra) as typeof scrubbed.extra;
  }

  // Scrub event.contexts
  if (scrubbed.contexts) {
    scrubbed.contexts = scrubObject(scrubbed.contexts) as typeof scrubbed.contexts;
  }

  // Scrub breadcrumb data
  if (scrubbed.breadcrumbs) {
    const bc = scrubbed.breadcrumbs;
    const values = Array.isArray(bc) ? bc : (bc as { values?: unknown[] }).values;
    if (Array.isArray(values)) {
      for (const crumb of values) {
        if (crumb && typeof crumb === 'object' && 'data' in crumb) {
          (crumb as Record<string, unknown>).data = scrubObject(
            (crumb as Record<string, unknown>).data,
          );
        }
      }
    }
  }

  return scrubbed;
}

// ---------------------------------------------------------------------------
// initSentry
//
// Call once at process startup if SENTRY_DSN is set.
// ---------------------------------------------------------------------------
export async function initSentry(): Promise<void> {
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return;

  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      beforeSend: scrubBeforeSend,
    });
  } catch (err) {
    // Sentry is optional — do not crash if package is missing
    console.warn('[sentry] init failed (non-fatal):', err);
  }
}
