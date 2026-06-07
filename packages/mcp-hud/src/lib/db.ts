/**
 * Drizzle DB client for the MCP server.
 *
 * This mirrors apps/web/lib/db/index.ts exactly — same DATABASE_URL env var,
 * same WAL PRAGMAs, same busy_timeout. Because the MCP server and the web app
 * are separate processes, they each hold their own better-sqlite3 connection,
 * but SQLite WAL mode allows concurrent readers + writers safely.
 *
 * Per hud-db skill:
 *   - journal_mode = WAL
 *   - synchronous = NORMAL
 *   - foreign_keys = ON
 *   - busy_timeout = 5000
 */
import * as schema from '@hud/db';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

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
