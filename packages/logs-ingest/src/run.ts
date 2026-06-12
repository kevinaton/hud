/**
 * packages/logs-ingest/src/run.ts
 *
 * Pipeline entry point for the logs-ingest worker.
 *
 * Stages (capture-only at L1 — parsing added at L2):
 *   1. Load Gmail credentials from GMAIL_CREDENTIALS_PATH env var
 *   2. Build whitelist query from enabled log_whitelist rows
 *   3. Refresh OAuth access token
 *   4. Fetch message IDs (incremental from last historyId/date)
 *   5. For each message:
 *      a. Fetch full message details
 *      b. DKIM gate — reject if dkim=pass for d=airbnb.com not found
 *      c. Store log_entries row (idempotent by externalRef)
 *      d. Store log_raw (DKIM-pass only)
 *   6. Update last processed marker in app_settings
 *   7. Print summary to stdout
 *
 * Flags:
 *   --reparse   Skip fetching; re-parse existing stored raws.
 *   --user-id=N Override user_id (default: 1)
 *
 * Per blueprint: actor = 'system:logs-ingest'
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { classifyEntry } from './classify.js';
import { initSentry } from './lib/sentry.js';
import {
  MAX_MESSAGES_PER_RUN,
  buildWhitelistQuery,
  checkDkim,
  fetchMessageDetail,
  listMessageIds,
  refreshAccessToken,
} from './connector/gmail.js';
import {
  db,
  getAppSetting,
  getLogRaw,
  getWhitelist,
  listPendingEntries,
  setAppSetting,
  storeLogEntry,
  storeLogRaw,
  updateLogEntryParsed,
} from './lib/db.js';
import { getRegistry } from './parsers/registry.js';
import type { GmailCredentials } from './connector/gmail.js';

// ---------------------------------------------------------------------------
// Parse CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const reparse = args.includes('--reparse');
const userIdArg = args.find((a) => a.startsWith('--user-id='));
const USER_ID = userIdArg ? Number(userIdArg.split('=')[1]) : 1;

if (Number.isNaN(USER_ID) || USER_ID < 1) {
  // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
  console.error('Invalid --user-id value');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  // Initialize Sentry with PII scrub hook (no-op if SENTRY_DSN not set)
  await initSentry();
  const summary = {
    fetched: 0,
    newEntries: 0,
    skipped: 0,
    dkimRejected: 0,
    parsed: 0,
    parseFailed: 0,
  };

  if (reparse) {
    // -------------------------------------------------------------------------
    // Re-parse mode: run parsers over stored raws without re-fetching
    // -------------------------------------------------------------------------
    // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
    console.log(`[logs-ingest] re-parse mode for user_id=${USER_ID}`);
    const pending = listPendingEntries(USER_ID);
    // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
    console.log(`[logs-ingest] ${pending.length} pending entries to re-parse`);

    for (const entry of pending) {
      const raw = getLogRaw(entry.id);
      if (!raw) {
        // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
        console.warn(`[logs-ingest] no raw content for entry ${entry.id} — skipping`);
        summary.skipped++;
        continue;
      }

      const result = await runParsers(
        USER_ID,
        entry.id,
        entry.sender,
        entry.subject ?? '',
        raw.bodyText ?? '',
        raw.bodyHtml ?? '',
      );
      if (result === 'parsed') summary.parsed++;
      else if (result === 'parse_failed') summary.parseFailed++;
      else summary.skipped++;
    }
  } else {
    // -------------------------------------------------------------------------
    // Normal mode: fetch from Gmail, gate, store raw
    // -------------------------------------------------------------------------
    const credsPath = process.env['GMAIL_CREDENTIALS_PATH'];
    if (!credsPath) {
      // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
      console.error('[logs-ingest] GMAIL_CREDENTIALS_PATH env var is not set');
      process.exit(1);
    }

    let creds: GmailCredentials;
    try {
      creds = JSON.parse(readFileSync(path.resolve(credsPath), 'utf-8')) as GmailCredentials;
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
      console.error(`[logs-ingest] Failed to read credentials: ${String(err)}`);
      process.exit(1);
    }

    // Get whitelist for this user
    const whitelist = getWhitelist(USER_ID);
    if (whitelist.length === 0) {
      // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
      console.log('[logs-ingest] No enabled whitelist entries — nothing to fetch');
      process.exit(0);
    }

    // Build query — incremental sync using last processed date
    const lastHistoryId = getAppSetting(USER_ID, 'logs.gmail_last_history_id');
    const query = buildWhitelistQuery(whitelist, lastHistoryId ?? undefined);

    if (!query) {
      // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
      console.log('[logs-ingest] Empty whitelist query — nothing to fetch');
      process.exit(0);
    }

    // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
    console.log(`[logs-ingest] query="${query}"`);

    // Refresh access token
    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(creds);
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
      console.error(`[logs-ingest] Token refresh failed: ${String(err)}`);
      process.exit(1);
    }

    // Fetch message IDs
    let messageIds: string[];
    try {
      messageIds = await listMessageIds(accessToken, query);
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
      console.error(`[logs-ingest] Failed to list messages: ${String(err)}`);
      process.exit(1);
    }

    summary.fetched = messageIds.length;
    // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
    console.log(`[logs-ingest] fetched ${messageIds.length} message IDs`);

    let latestInternalDate: string | null = null;

    for (const messageId of messageIds) {
      let msg;
      try {
        msg = await fetchMessageDetail(accessToken, messageId);
      } catch (err) {
        // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
        console.warn(`[logs-ingest] Failed to fetch message ${messageId}: ${String(err)}`);
        summary.skipped++;
        continue;
      }

      // Track latest internal date for incremental sync
      if (!latestInternalDate || msg.internalDate > latestInternalDate) {
        latestInternalDate = msg.internalDate;
      }

      const sender = extractEmail(msg.headers['from'] ?? '');
      const subject = msg.headers['subject'] ?? null;
      const receivedAt = internalDateToIso(msg.internalDate);
      const authResults = msg.headers['authentication-results'] ?? '';

      // DKIM gate
      const dkimPass = checkDkim(authResults, 'airbnb.com');

      if (!dkimPass) {
        // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
        console.log(`[logs-ingest] DKIM-fail for ${messageId} from ${sender}`);
        // Store a rejected entry (no raw stored)
        const entry = storeLogEntry(USER_ID, {
          userId: USER_ID,
          source: 'email',
          sourceAccount: process.env['GMAIL_SOURCE_ACCOUNT'] ?? 'jarvismolt8@gmail.com',
          externalRef: messageId,
          sender,
          subject,
          receivedAt,
          dkimPass: 0,
          kind: 'unknown',
          parserVersion: null,
          parsedJson: null,
          status: 'rejected',
          statusReason: 'dkim_fail',
        });

        if (entry.status === 'rejected' && entry.statusReason === 'dkim_fail') {
          summary.dkimRejected++;
        } else {
          summary.skipped++; // pre-existing entry
        }
        continue;
      }

      // Store the log_entries row (idempotent)
      const entry = storeLogEntry(USER_ID, {
        userId: USER_ID,
        source: 'email',
        sourceAccount: process.env['GMAIL_SOURCE_ACCOUNT'] ?? 'jarvismolt8@gmail.com',
        externalRef: messageId,
        sender,
        subject,
        receivedAt,
        dkimPass: 1,
        kind: 'unknown',
        parserVersion: null,
        parsedJson: null,
        status: 'pending',
        statusReason: null,
      });

      // Check if this was a newly created entry or already existed
      const isNew = entry.createdAt === entry.updatedAt;

      if (!isNew) {
        summary.skipped++;
        continue;
      }

      summary.newEntries++;

      // Store raw content (immutable once stored)
      storeLogRaw(entry.id, {
        headersJson: msg.rawHeadersJson,
        ...(msg.bodyText != null ? { bodyText: msg.bodyText } : {}),
        ...(msg.bodyHtml != null ? { bodyHtml: msg.bodyHtml } : {}),
      });

      // Attempt parsing (L2 stage — classify + parse)
      const parseResult = await runParsers(
        USER_ID,
        entry.id,
        sender,
        subject ?? '',
        msg.bodyText ?? '',
        msg.bodyHtml ?? '',
      );
      if (parseResult === 'parsed') summary.parsed++;
      else if (parseResult === 'parse_failed') summary.parseFailed++;
    }

    // Update incremental sync marker
    if (latestInternalDate) {
      // Store as a date string YYYY/MM/DD for the Gmail 'after:' query
      const dateStr = internalDateToGmailAfter(latestInternalDate);
      setAppSetting(USER_ID, 'logs.gmail_last_history_id', dateStr);
    }
  }

  // Update heartbeat
  setAppSetting(USER_ID, 'logs.last_successful_ingest', new Date().toISOString());

  // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
  console.log(
    `[logs-ingest] done — fetched=${summary.fetched} new=${summary.newEntries} skipped=${summary.skipped} dkim_rejected=${summary.dkimRejected} parsed=${summary.parsed} parse_failed=${summary.parseFailed}`,
  );
}

// ---------------------------------------------------------------------------
// runParsers
//
// Classifies and parses a single log entry. Returns the result status.
// If no parser matches, the entry stays 'pending' (unknown kind).
// ---------------------------------------------------------------------------
async function runParsers(
  userId: number,
  entryId: number,
  sender: string,
  subject: string,
  bodyText: string,
  bodyHtml: string,
): Promise<'parsed' | 'parse_failed' | 'unknown'> {
  try {
    const registry = getRegistry();
    const kind = classifyEntry(sender, subject, registry);

    if (!kind) {
      return 'unknown'; // No parser matched — stays pending
    }

    const parser = registry[kind];
    if (!parser) return 'unknown';

    const result = parser.parse({ sender, subject, bodyText, bodyHtml });

    if ('error' in result) {
      updateLogEntryParsed(userId, entryId, {
        kind,
        parserVersion: parser.version,
        parsedJson: JSON.stringify({ error: result.error }),
        status: 'parse_failed',
        statusReason: result.error,
      });
      return 'parse_failed';
    }

    updateLogEntryParsed(userId, entryId, {
      kind,
      parserVersion: parser.version,
      parsedJson: JSON.stringify(result.data),
      status: 'pending',
      statusReason: null,
    });

    return 'parsed';
  } catch (err) {
    updateLogEntryParsed(userId, entryId, {
      kind: 'unknown',
      parserVersion: 'error',
      parsedJson: JSON.stringify({ error: String(err) }),
      status: 'parse_failed',
      statusReason: String(err),
    });
    return 'parse_failed';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract email address from "Name <email@domain.com>" or "email@domain.com" */
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? (match[1] ?? from).toLowerCase() : from.toLowerCase().trim();
}

/** Convert Gmail internalDate (Unix ms string) to ISO-8601 with Asia/Manila offset */
function internalDateToIso(internalDate: string): string {
  const ms = Number(internalDate);
  const date = new Date(ms);
  // Manila is UTC+8
  const offsetMs = 8 * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const pad = (n: number, d = 2) => String(n).padStart(d, '0');
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}+08:00`
  );
}

/** Convert Gmail internalDate to YYYY/MM/DD for Gmail 'after:' query */
function internalDateToGmailAfter(internalDate: string): string {
  const ms = Number(internalDate);
  const date = new Date(ms);
  const offsetMs = 8 * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${local.getUTCFullYear()}/${pad(local.getUTCMonth() + 1)}/${pad(local.getUTCDate())}`;
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: run.ts is a CLI tool
  console.error('[logs-ingest] fatal:', err);
  process.exit(1);
});
