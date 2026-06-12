/**
 * packages/logs-ingest/src/classify.ts
 *
 * Classifier: maps (sender, subject) → parser key.
 *
 * Returns null when no parser matches — entry remains kind='unknown'.
 * Does NOT perform parsing; only identifies which parser to use.
 */

import type { ParserRegistry } from './parsers/registry.js';

/**
 * Classify an email by its sender and subject.
 * Iterates the registry's match functions in insertion order.
 * Returns the first matching key, or null if none match.
 */
export function classifyEntry(
  sender: string,
  subject: string,
  registry: ParserRegistry,
): string | null {
  for (const [key, parser] of Object.entries(registry)) {
    if (parser.match(sender.toLowerCase(), subject)) {
      return key;
    }
  }
  return null;
}
