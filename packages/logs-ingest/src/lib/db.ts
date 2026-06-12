/**
 * packages/logs-ingest/src/lib/db.ts
 *
 * Drizzle DB client for the logs-ingest pipeline.
 * Mirrors mcp-hud/src/lib/db.ts — same WAL PRAGMAs, same busy_timeout.
 *
 * Per hud-db skill: journal_mode=WAL, foreign_keys=ON, busy_timeout=5000.
 * Per hud-audit skill: every write function calls writeIngestAudit inside
 *   the same transaction.
 */

import * as schema from '@hud/db';
import type { AuditAction, LogEntry, LogRaw, LogWhitelist, NewLogEntry } from '@hud/db';
import Database from 'better-sqlite3';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';

// ---------------------------------------------------------------------------
// DB client (singleton per process)
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/useLiteralKeys: DATABASE_URL is a well-known env var name
const dbUrl = process.env['DATABASE_URL'] ?? 'file:../../data/hud.db';
const dbPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl;

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// writeIngestAudit — inline audit helper for the ingest worker
//
// Actor is always 'system:logs-ingest' here.
// ---------------------------------------------------------------------------
function writeIngestAudit(
  tx: DrizzleTx,
  opts: {
    userId: number;
    action: AuditAction;
    entity: string;
    entityId?: string;
    payload?: Record<string, unknown>;
  },
): void {
  tx.insert(schema.auditLog)
    .values({
      userId: opts.userId,
      actor: 'system:logs-ingest',
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId ?? null,
      payloadJson: opts.payload ? JSON.stringify(opts.payload) : null,
      ipAddress: null,
      userAgent: null,
    })
    .run();
}

// ---------------------------------------------------------------------------
// getWhitelist
//
// Returns all enabled log_whitelist rows for a user.
// Used to build the Gmail q query.
// ---------------------------------------------------------------------------
export function getWhitelist(userId: number): LogWhitelist[] {
  return db
    .select()
    .from(schema.logWhitelist)
    .where(and(eq(schema.logWhitelist.userId, userId), eq(schema.logWhitelist.enabled, 1)))
    .all();
}

// ---------------------------------------------------------------------------
// getAppSetting / setAppSetting
//
// Read/write per-user key/value settings.
// ---------------------------------------------------------------------------
export function getAppSetting(userId: number, key: string): string | null {
  const row = db
    .select()
    .from(schema.appSettings)
    .where(and(eq(schema.appSettings.userId, userId), eq(schema.appSettings.key, key)))
    .get();
  return row?.value ?? null;
}

export function setAppSetting(userId: number, key: string, value: string): void {
  db.insert(schema.appSettings)
    .values({ userId, key, value })
    .onConflictDoUpdate({
      target: [schema.appSettings.userId, schema.appSettings.key],
      set: { value, updatedAt: sql`(datetime('now'))` },
    })
    .run();
}

// ---------------------------------------------------------------------------
// storeLogEntry
//
// Inserts a log_entries row. Idempotent by (userId, source, externalRef).
// Returns the stored row (existing or newly created).
// Writes one audit_log row in the same transaction.
// ---------------------------------------------------------------------------
export function storeLogEntry(
  userId: number,
  input: Omit<NewLogEntry, 'id' | 'createdAt' | 'updatedAt'>,
): LogEntry {
  return db.transaction((tx) => {
    // Attempt insert — do nothing on conflict (idempotency)
    tx.insert(schema.logEntries)
      .values({ ...input, userId })
      .onConflictDoNothing({
        target: [schema.logEntries.userId, schema.logEntries.source, schema.logEntries.externalRef],
      })
      .run();

    // Fetch the row (whether just inserted or pre-existing)
    const row = tx
      .select()
      .from(schema.logEntries)
      .where(
        and(
          eq(schema.logEntries.userId, userId),
          eq(schema.logEntries.source, input.source ?? 'email'),
          eq(schema.logEntries.externalRef, input.externalRef),
        ),
      )
      .get();

    if (!row) {
      throw new Error(`storeLogEntry: failed to retrieve row for externalRef=${input.externalRef}`);
    }

    // Write audit only on first insert (created_at = updated_at → new row)
    if (row.createdAt === row.updatedAt) {
      writeIngestAudit(tx, {
        userId,
        action: 'create',
        entity: 'log_entry',
        entityId: String(row.id),
        payload: {
          externalRef: row.externalRef,
          sender: row.sender,
          kind: row.kind,
          status: row.status,
          dkimPass: row.dkimPass,
        },
      });
    }

    return row;
  });
}

// ---------------------------------------------------------------------------
// storeLogRaw
//
// Inserts the raw message content for a log entry.
// ON CONFLICT DO NOTHING — raw is immutable once stored.
// ---------------------------------------------------------------------------
export function storeLogRaw(
  logEntryId: number,
  raw: { headersJson?: string; bodyText?: string; bodyHtml?: string },
): void {
  db.insert(schema.logRaw)
    .values({
      logEntryId,
      headersJson: raw.headersJson ?? null,
      bodyText: raw.bodyText ?? null,
      bodyHtml: raw.bodyHtml ?? null,
    })
    .onConflictDoNothing()
    .run();
}

// ---------------------------------------------------------------------------
// getLogRaw
//
// Fetches the raw content for a log entry (used in re-parse mode).
// ---------------------------------------------------------------------------
export function getLogRaw(logEntryId: number): LogRaw | null {
  const row = db.select().from(schema.logRaw).where(eq(schema.logRaw.logEntryId, logEntryId)).get();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// listPendingEntries
//
// Returns log_entries rows with status='pending' (for re-parse mode).
// ---------------------------------------------------------------------------
export function listPendingEntries(userId: number): LogEntry[] {
  return db
    .select()
    .from(schema.logEntries)
    .where(and(eq(schema.logEntries.userId, userId), eq(schema.logEntries.status, 'pending')))
    .all();
}

// ---------------------------------------------------------------------------
// updateLogEntryParsed
//
// Updates a log_entries row after parsing: sets kind, parserVersion,
// parsedJson, and status (pending, parse_failed).
// Writes one audit_log row.
// ---------------------------------------------------------------------------
export function updateLogEntryParsed(
  userId: number,
  entryId: number,
  update: {
    kind: string;
    parserVersion: string;
    parsedJson: string;
    status: 'pending' | 'parse_failed';
    statusReason?: string | null;
  },
): void {
  db.transaction((tx) => {
    tx.update(schema.logEntries)
      .set({
        kind: update.kind,
        parserVersion: update.parserVersion,
        parsedJson: update.parsedJson,
        status: update.status,
        statusReason: update.statusReason ?? null,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(and(eq(schema.logEntries.id, entryId), eq(schema.logEntries.userId, userId)))
      .run();

    writeIngestAudit(tx, {
      userId,
      action: 'update',
      entity: 'log_entry',
      entityId: String(entryId),
      payload: { kind: update.kind, status: update.status, parserVersion: update.parserVersion },
    });
  });
}
