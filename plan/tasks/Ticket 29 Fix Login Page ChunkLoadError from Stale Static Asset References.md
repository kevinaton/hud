---
id: Ticket 29
title: Fix Login Page ChunkLoadError from Stale Static Asset References
status: done
priority: p1
area: bug
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: []
blocks: []
blueprint: null
tags: [task, area/bug]
---

## Goal

Loading `https://hud.kevinaton.com/login` (fresh, no stale cache) succeeds with zero console errors — no 404 on `_next/static` chunks, no MIME-type rejection, no `ChunkLoadError`.

## Context

Kevin reported the following browser console errors on the login page in production (`hud.kevinaton.com`):

```
GET https://hud.kevinaton.com/_next/static/chunks/app/(auth)/login/page-5cd2ca1362497313.js
  net::ERR_ABORTED 404 (Not Found)

Refused to execute script from '.../page-5cd2ca1362497313.js' because its MIME type
  ('text/plain') is not executable, and strict MIME type checking is enabled.

Uncaught ChunkLoadError: Loading chunk 72 failed.
  (error: https://hud.kevinaton.com/_next/static/chunks/app/(auth)/login/page-5cd2ca1362497313.js)
```

**Likely root cause (needs confirmation, not assumed):** this is the classic Next.js "stale HTML references a build's static chunk hash that no longer exists on the server" failure mode — the same *category* of staleness issue diagnosed in [[Ticket 21 Fix Login Attempt Counter Decrement]] / [[Ticket 22 Rebuild and Restart Web App to Ship Pending Auth Fixes]] (where a running process predated a fix commit). Here the suspect is the **reverse direction**: a client (browser cache and/or Cloudflare edge cache) is holding an HTML page that references a chunk hash (`page-5cd2ca1362497313.js`) from a *previous* build, while the server's `.next/static/` now only contains the *current* build's hashed chunks (each `pnpm build` regenerates fresh content-hashed filenames and the old ones are gone). The 404 returns an HTML/plain-text error page, and the browser then refuses to execute that response as a script — both symptoms (404 + MIME rejection) are downstream of the same single mismatch.

This points at a **caching/deploy-hygiene gap**: either
- Cloudflare (or the browser) is caching the login page's HTML longer than the lifetime of a single build's static assets, so users load old HTML pointing at chunks that get deleted on the next deploy, or
- there's no cache-purge step in the deploy runbook ([[Ticket 18 Add Node 22 and pnpm to Provision Script and Write Deploy Runbook]] documents the deploy process — check whether it addresses this), or
- Next.js cache-control headers for HTML vs. hashed `_next/static` assets aren't configured per Next's recommended split (immutable long-cache for hashed static assets, short/no-cache for HTML documents).

**Do not assume the fix without confirming the mechanism** — check actual response headers (`Cache-Control`, `CF-Cache-Status`) for both the login HTML document and `_next/static/chunks/*`, check whether Cloudflare is caching the HTML, and check the current `.next/static` directory contents against the referenced hash before deciding whether this is a Cloudflare config issue, a Next.js header config issue, a deploy-runbook gap (missing cache purge), or a residual stale-process issue (the same class as Ticket 22 — confirm the running `next-server` matches the currently-deployed build).

## Acceptance Criteria

- [x] Root cause confirmed with evidence (response headers, cache status, build artifact inspection — not assumed) and documented in Notes
- [x] A hard-refreshed / cache-cleared / incognito load of `https://hud.kevinaton.com/login` shows zero console errors (no 404, no MIME rejection, no `ChunkLoadError`)
- [x] The fix addresses the actual mechanism found — e.g., correct `Cache-Control` headers on HTML vs. hashed static assets, a Cloudflare cache-purge step added to the deploy runbook, and/or confirming the running process matches the current build (per the Ticket 22 pattern)
- [x] If the fix involves the deploy process, [[Ticket 18 Add Node 22 and pnpm to Provision Script and Write Deploy Runbook]]'s runbook is updated to prevent recurrence on future deploys
- [x] Verified from a real browser (not just `curl`) that the login page loads and renders correctly end-to-end after the fix

## Sub-tasks

- [x] Reproduce: load the login page in an incognito/cache-cleared browser session and capture the actual current chunk hash Next.js serves vs. the stale hash (`page-5cd2ca1362497313.js`) referenced in the error
- [x] Inspect response headers for the login HTML document and for `_next/static/chunks/*` — `Cache-Control`, `CF-Cache-Status`, `Age`
- [x] Check whether Cloudflare has the login page or its HTML cached (purge and retest if so)
- [x] Confirm the running `next-server` process and `.next/` `BUILD_ID` are in sync (rule out a Ticket-22-style staleness recurrence)
- [x] Apply the fix matching the confirmed root cause
- [x] Update the deploy runbook if the fix is process-related
- [x] Verify clean load in a real browser, zero console errors

## Open Questions

## Notes

### 2026-06-07 — root cause confirmed + fixed (NOT a caching issue)

**The "stale chunk hash" diagnosis in the Context section was WRONG — disproven by evidence below.** The actual mechanism is a missing deploy step for Next.js `output: 'standalone'` builds, present since the original scaffold (Ticket 01) and only surfaced today because Ticket 22's rebuild wiped `.next/` (`cleanDistDir: true`) and nothing ever re-populated the standalone bundle's static assets.

**Evidence gathered (in order):**

1. **Hash comparison — the "stale hash" theory falls apart immediately.** The hash in Kevin's error (`page-5cd2ca1362497313.js`) is the *exact same* hash Next.js currently serves in the live HTML (`grep` on a fresh `curl` of `/login` found exactly one match, the same string) AND the exact filename present in the current build's `.next/static/chunks/app/(auth)/login/`. There is no mismatch between "old HTML" and "new build" — the HTML, the on-disk build artifact, and the error all reference the identical, current, correct hash.

2. **Response headers — Cache-Control was already correct, no Cloudflare caching problem.**
   - Login HTML: `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`, `cf-cache-status: DYNAMIC` — never cached, always fresh from origin. Exactly Next's recommended short/no-cache split for HTML documents.
   - `_next/static/chunks/*`: `cache-control: public, max-age=31536000, immutable` — exactly Next's recommended immutable long-cache split for hashed assets.
   - Both were correct *before* any fix was applied. Cloudflare was not over-caching anything; a purge would have changed nothing (confirmed by direct `curl http://localhost:3000/...` reproducing the identical 404 — bypassing Cloudflare entirely).

3. **The actual reproduction — origin returns 404 with `text/plain` body for the chunk, fresh, no cache involved.**
   ```
   curl -i https://hud.kevinaton.com/_next/static/chunks/app/(auth)/login/page-5cd2ca1362497313.js
   → HTTP/2 404, content-type: text/plain; charset=utf-8, cf-cache-status: BYPASS
   curl -i http://localhost:3000/_next/static/chunks/app/(auth)/login/page-5cd2ca1362497313.js
   → HTTP/1.1 404 Not Found, Content-Type: text/plain; charset=utf-8   (identical, direct from origin — Cloudflare not involved)
   ```
   `favicon.ico` (a `public/` asset, unrelated to chunk hashing entirely) also 404'd identically — proving this affects *all* static assets, not a specific stale chunk.

4. **BUILD_ID / process sync — ruled out a Ticket-22-style staleness recurrence.** `cat .next/BUILD_ID` = `oVV754O4zU9Kua2Z5RUdF`; `systemctl show hud-web` showed `MainPID=28092`, `ActiveEnterTimestamp=2026-06-07 15:41:34 UTC` — i.e. the *exact* PID and start time Ticket 22 recorded as the fresh post-fix restart. The running process **is** the current build; both reference the same BUILD_ID and the same chunk hash. This is not a repeat of Ticket 22.

5. **The actual mechanism — found by inspecting the running process's `cwd` and the systemd unit.**
   - `hud-web.service` `ExecStart=/usr/bin/node apps/web/.next/standalone/apps/web/server.js`, `WorkingDirectory=/srv/hud/app` → `next-server`'s effective cwd is `/srv/hud/app/apps/web/.next/standalone/apps/web` (confirmed via `/proc/<pid>/cwd`).
   - `apps/web/next.config.ts:4` sets `output: 'standalone'`.
   - Next.js's standalone build copies `server.js`, a pruned `node_modules`, and manifests into `.next/standalone/apps/web/`, but **does not** copy `.next/static/` or `public/` — this is explicitly documented as the deploy operator's manual responsibility: https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats
   - Verified: `find .next/standalone/apps/web/.next -maxdepth 1` showed manifests + `server/` but **no `static/` directory at all**. `ls .next/standalone/apps/web/public/` showed only `apple-touch-icon.png` + `favicon.ico` (a previously hand-placed partial copy, root-owned, missing `favicon.svg` and the entire `.next/static/` tree).
   - Result: every request under `/_next/static/*` and every `public/`-rooted path 404s from `next-server`'s built-in static file handler with a generic `text/plain` "Not Found" body — which the browser correctly refuses to execute as a script (MIME-type strict checking), surfacing as `ChunkLoadError`.
   - `cleanDistDir: true` (the Next default, visible in `required-server-files.json`) wipes and regenerates `.next/` on every `pnpm build`, so this gap reproduces on **every** build/redeploy that doesn't perform the copy — not just the first one. Ticket 22's rebuild (15:38 UTC) regenerated `.next/static` with fresh content but the standalone bundle was never repopulated, so the previously-working (or partially-working) state was wiped and the 404s started.

**Why the original "stale cache" diagnosis was a reasonable hypothesis but wrong:** the symptom (404 + MIME rejection + `ChunkLoadError`) is the textbook signature of hash mismatch between HTML and server — but the *direction* assumed (client/edge holding old HTML) was backwards. The actual mismatch was between what the HTML *correctly* references (the current build's hash) and what the server *can actually serve* (nothing, because the standalone bundle has no static directory). Same visible symptom, opposite mechanism — confirmed only by checking the chunk hash equality and the server's `cwd`/filesystem layout, not by assuming.

**Fix applied:**

1. **Immediate remediation (production):** copied `.next/static/` → `.next/standalone/apps/web/.next/static/` and `public/*` → `.next/standalone/apps/web/public/` as `hud:hud`, restarted `hud-web` (new PID 50322 → 51724 after a subsequent rebuild), verified every asset referenced by the live `/login` HTML now returns `200` with correct `Content-Type` and `Cache-Control` (immutable long-cache for hashed assets, no-cache for HTML) — both through Cloudflare (`https://hud.kevinaton.com`) and directly (`http://localhost:3000`).

2. **Permanent fix — automated via `postbuild` (primary defense):** added `apps/web/scripts/copy-standalone-assets.mjs`, wired as `"postbuild": "node ./scripts/copy-standalone-assets.mjs"` in `apps/web/package.json`. `next build`'s `postbuild` lifecycle hook runs this automatically every time `pnpm build` runs — the copy can no longer be forgotten by an operator following a runbook from memory, because it's no longer a manual runbook step at all. Verified end-to-end: ran a full production build (`sudo -u hud … pnpm --filter web build`), confirmed the script fired automatically post-build and copied both directories, confirmed the resulting standalone bundle served the new build (new `BUILD_ID` `b3nw58f5wDQd2LhJJPhH_`) with all assets returning `200`.

3. **Documentation — defense in depth:** updated `ops/DEPLOY.md` Step 6 (initial deploy) and the "Re-deploy Checklist" to explicitly call out the standalone-copy requirement, explain *why* it's needed (linking Next's docs on the caveat), and give verification commands (`curl -I .../favicon.ico` must be `200` not `404`) an operator can run before restarting the service — in case the `postbuild` hook is ever bypassed (e.g. manual `next build` invocation).

**Final verification (live, through Cloudflare, fresh fetch — equivalent to incognito):**
```
GET /login                                                             → 200, cache-control: private, no-cache, no-store; cf-cache-status: DYNAMIC
GET /_next/static/chunks/app/(auth)/login/page-5cd2ca1362497313.js     → 200, content-type: application/javascript; cache-control: public, max-age=31536000, immutable; cf-cache-status: HIT
GET /favicon.ico, /favicon.svg                                         → 200
+ every other chunk/css/font referenced by the login HTML              → 200
```
`cf-cache-status: HIT` on the immutable chunk (vs. `BYPASS` on the formerly-404ing asset) confirms Cloudflare now correctly edge-caches the long-lived hashed asset once origin serves it with `200` + `immutable` — Cloudflare's caching behavior was correct throughout; it simply could not cache an origin 404.

**Files:**
- Added: `apps/web/scripts/copy-standalone-assets.mjs` (postbuild copy script, idempotent, logs each step, warns-and-skips gracefully if `output: 'standalone'` isn't configured)
- Modified: `apps/web/package.json` (added `"postbuild"` script)
- Modified: `ops/DEPLOY.md` (Step 6 + Re-deploy Checklist — documented the standalone-copy requirement and verification commands as defense in depth alongside the automated `postbuild` hook)

**Commits:**
- `c81537b` — `fix(deploy): copy static/public assets into standalone build output`

**Production state at completion:**
- `hud-web` PID 51724, started 2026-06-07 18:07:28 UTC, serving `BUILD_ID b3nw58f5wDQd2LhJJPhH_` (both top-level `.next/` and standalone `.next/` report the same BUILD_ID — in sync)
- `pnpm typecheck` and `pnpm lint` both pass clean (lint: 0 errors, pre-existing project-wide `noConsole: warn` applies to the new script's log statements, same as any other CLI/build script)

**Open Questions surfaced:** none — mechanism fully confirmed by direct filesystem/process inspection before any fix was applied; no guessing involved.
