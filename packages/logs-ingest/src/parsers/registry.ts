/**
 * packages/logs-ingest/src/parsers/registry.ts
 *
 * Parser registry — maps classifier keys to versioned parser implementations.
 *
 * Each parser declares:
 *   version  — semantic version string stored in parsed_json for re-parse provenance
 *   match    — (sender: string, subject: string) → boolean — used by the classifier
 *   parse    — ({ sender, subject, bodyText, bodyHtml }) → ParseResult
 *
 * When Airbnb changes a template: add a v2 file, import it here, and update
 * the registry to point to v2. Old v1 stays for provenance.
 *
 * Per blueprint: parsers are deterministic. No LLM in the parse path.
 */

import { reservationConfirmedParserV1 } from './airbnb/reservation_confirmed.v1.js';
import { cancellationParserV1 } from './airbnb/cancellation.v1.js';
import { payoutParserV1 } from './airbnb/payout.v1.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParseInput {
  sender: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

export type ParseResult = { data: Record<string, unknown> } | { error: string };

export interface Parser {
  version: string;
  /** Returns true if this parser should handle the given (sender, subject). */
  match: (sender: string, subject: string) => boolean;
  /** Parses the email body. Returns structured data or an error reason. */
  parse: (input: ParseInput) => ParseResult;
}

export type ParserRegistry = Record<string, Parser>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

let _registry: ParserRegistry | null = null;

export function getRegistry(): ParserRegistry {
  if (_registry) return _registry;

  _registry = {
    'airbnb.reservation_confirmed': reservationConfirmedParserV1,
    'airbnb.cancellation': cancellationParserV1,
    'airbnb.payout': payoutParserV1,
  };

  return _registry;
}
