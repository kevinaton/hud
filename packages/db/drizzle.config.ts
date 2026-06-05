import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

// This config is designed to run from packages/db/ via:
//   pnpm --filter @hud/db db:generate
//   pnpm --filter @hud/db db:migrate
//
// Paths are relative to packages/db/ (the CWD when the command runs).

// biome-ignore lint/complexity/useLiteralKeys: DATABASE_URL is a well-known env var name
const dbUrl = process.env['DATABASE_URL'] ?? 'file:../../data/hud.db';
const dbPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl;

export default defineConfig({
  schema: './schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.resolve(dbPath),
  },
  verbose: true,
  strict: true,
});
