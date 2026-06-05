/**
 * Singleton Drizzle client for better-sqlite3.
 *
 * WAL mode, foreign keys, and a busy timeout are set at boot.
 * DATABASE_URL env var controls the DB path (strip the 'file:' prefix).
 *
 * This module is synchronous — never `await` a Drizzle query here.
 */
import * as schema from '@hud/db';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

// DATABASE_URL is set via .env.local for local dev and via systemd EnvironmentFile in prod.
// Strip the 'file:' prefix used by SQLite URL convention.
// biome-ignore lint/complexity/useLiteralKeys: DATABASE_URL is a well-known env var name
const dbUrl = process.env['DATABASE_URL'] ?? 'file:../../data/hud.db';
const dbPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl;

const sqlite = new Database(dbPath);

// Required PRAGMAs per hud-db skill
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });

// DrizzleTx: the transaction callback argument type, used by writeAudit
export type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
