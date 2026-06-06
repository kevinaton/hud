#!/usr/bin/env tsx
// Root-level stub — delegates to the actual implementation at apps/web/scripts/import-cashflow.ts
// Invoked via: pnpm import:cashflow -- [args]
// The root package.json routes this through pnpm --filter web import:cashflow, which runs
// apps/web/scripts/import-cashflow.ts directly. This file is kept for discoverability only.
//
// To run the importer:
//   pnpm import:cashflow -- --file "db backups/cashflow_export.csv" --user-email admin@hud.local
//   pnpm import:cashflow -- --file "db backups/cashflow_export.csv" --user-email admin@hud.local --dry-run

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { argv } from 'node:process';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const target = path.resolve(__dirname, '..', 'apps', 'web', 'scripts', 'import-cashflow.ts');

const result = spawnSync('tsx', [target, ...argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 0);
