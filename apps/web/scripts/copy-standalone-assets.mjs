#!/usr/bin/env node
// Copies `.next/static/` and `public/` into the `output: 'standalone'`
// bundle after every `next build`.
//
// Why this exists (Ticket 29 — ChunkLoadError / 404 on every _next/static
// and public asset in production):
//
// Next.js's standalone output (`output: 'standalone'` in next.config.ts)
// copies `server.js` and a pruned `node_modules` into `.next/standalone/`,
// but — per Next's own docs — it does NOT copy `.next/static/` or
// `public/`. That's documented as the deploy operator's responsibility:
// https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats
//
// `hud-web.service` runs `node .next/standalone/apps/web/server.js` with
// that directory as `cwd`. Without this copy, every request under
// `/_next/static/*` (JS chunks, CSS, fonts) and every `public/` asset
// (favicons, etc.) 404s with a `text/plain` body — which the browser then
// refuses to execute as a script, surfacing as `ChunkLoadError` and MIME
// type rejections on every page, not just login.
//
// `cleanDistDir: true` (the Next.js default) wipes and regenerates `.next/`
// on every build, so this copy must run on EVERY build — not just the
// first deploy. Wiring it up as `postbuild` (run automatically by
// `pnpm build` -> `next build` -> this script) means the step can never be
// forgotten by an operator following a runbook from memory.

import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const standaloneAppRoot = path.join(webRoot, '.next', 'standalone', 'apps', 'web');

async function copyDir(src, dest, label) {
  if (!existsSync(src)) {
    console.warn(`[copy-standalone-assets] skip ${label}: source not found at ${src}`);
    return;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true, force: true });
  console.log(`[copy-standalone-assets] copied ${label}: ${src} -> ${dest}`);
}

async function main() {
  if (!existsSync(standaloneAppRoot)) {
    console.warn(
      `[copy-standalone-assets] standalone output not found at ${standaloneAppRoot} — is \`output: "standalone"\` set in next.config.ts? Skipping (nothing to do).`,
    );
    return;
  }

  await copyDir(
    path.join(webRoot, '.next', 'static'),
    path.join(standaloneAppRoot, '.next', 'static'),
    '.next/static',
  );
  await copyDir(path.join(webRoot, 'public'), path.join(standaloneAppRoot, 'public'), 'public');

  console.log('[copy-standalone-assets] done — standalone bundle is ready to serve static assets');
}

main().catch((err) => {
  console.error('[copy-standalone-assets] failed:', err);
  process.exitCode = 1;
});
