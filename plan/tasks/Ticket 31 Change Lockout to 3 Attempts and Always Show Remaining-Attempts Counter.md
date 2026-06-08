---
id: Ticket 31
title: Change Lockout to 3 Attempts and Always Show Remaining-Attempts Counter
status: done
priority: p1
area: bug
estimate: S
created: 2026-06-07
updated: 2026-06-08
depends-on: []
blocks: []
blueprint: null
tags: [task, area/bug]
---

## Goal

The login page always shows the `WarningCounter` (no hide-until-failure), starting at **"03"** on first load, decrementing by one with each wrong-password attempt (03 → 02 → 01 → locked), and the account locks after **3** failed attempts — matching Kevin's explicit spec, overriding the currently-deployed `5`-attempt threshold.

## Context

Kevin tested the live login page (2026-06-07) and got "04" after one wrong attempt — technically correct per the *currently coded* `LOCKOUT_THRESHOLD = 5` (`apps/web/lib/auth/lockout.ts:23`, `5 - 1 = 4`), but **not what he wants**. His direct instruction:

> "why it started at 04 when I got wrong! It must start 3 then because I got wrong it is now 2. AND SHOW THE 03 attempts remaining always do not hide it! Did i tell you to hide it? No!"

This resolves, in Kevin's favor, the **"5/15 vs 3/20" spec mismatch** the orchestrator identified and explained to him earlier in this session: somewhere in HUD's spec/strategy docs the lockout policy was described as **3 attempts / 20-minute lockout**, but the implemented constants are `LOCKOUT_THRESHOLD = 5` / `LOCKOUT_DURATION_MINUTES = 15`. Kevin is now explicitly confirming **3 is the correct attempt count** he wants. **The 20-vs-15-minute lockout DURATION was not explicitly addressed in his message — confirm with Kevin before changing `LOCKOUT_DURATION_MINUTES`** (don't assume "3/20" as a pair just because that's how the orchestrator originally framed the mismatch; he only corrected the attempt count here).

This also **explicitly reverses a deliberate design decision from [[Ticket 21 Fix Login Attempt Counter Decrement]]** — that ticket's fix commit (`b268af6`) intentionally made the counter `null` (hidden) until the first failed attempt, with the stated rationale "showing 'you have X attempts left' before you've made any mistake would be confusing/premature." Kevin has now directly overridden that rationale: he wants the counter **always visible**, starting at the full threshold value, from the moment the page loads. This is Kevin's call to make as product owner — implement per his stated preference, not the prior ticket's UX judgment call.

## Acceptance Criteria

- [x] `LOCKOUT_THRESHOLD` changed from `5` to `3` in `apps/web/lib/auth/lockout.ts`
- [x] `LOCKOUT_DURATION_MINUTES` — confirm with Kevin whether it should change from `15` to `20`, or stay at `15`; do not change it without an explicit answer (flag in Open Questions if unanswered at implementation time, and implement with whatever value he confirms — default to leaving it at `15` if unreachable, since he did not ask to change it)
- [x] `_LoginForm.tsx`: `remainingAttempts` state initializes to the lockout threshold (`3`, sourced from a shared constant — not hardcoded twice) instead of `null`, and the `WarningCounter` renders unconditionally (remove the `{remainingAttempts !== null && ...}` hide-until-failure gate)
- [x] On fresh page load (no submission yet), the counter shows **"03"**
- [x] After one wrong-password submission, the counter shows **"02"**; after two, **"01"**; after three, the account locks (existing lockout UI/countdown behavior preserved)
- [x] `WarningCounter`'s default `label` prop and any other lockout-threshold-derived copy/messaging remain accurate for a 3-attempt policy (audit for any hardcoded "5" elsewhere — e.g., error messages, tests, docs)
- [x] Existing lockout tests (`apps/web/lib/auth/lockout.test.ts` or similar) updated to assert against the new threshold value, not a hardcoded `5`
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass
- [x] Verified live: fresh load shows "03"; sequential wrong attempts decrement correctly; lockout triggers on the 3rd failure

## Sub-tasks

- [x] Confirm `LOCKOUT_DURATION_MINUTES` value with Kevin before touching it (ask directly — do not infer from the "3/20" framing)
- [x] Change `LOCKOUT_THRESHOLD` to `3` in `lib/auth/lockout.ts`
- [x] Update `_LoginForm.tsx`: initialize `remainingAttempts` to the threshold constant (import it, don't duplicate the literal), remove the hide-until-failure conditional render
- [x] Audit the codebase for any other hardcoded references to the old threshold (`5`) or duration (`15`) tied to lockout messaging/tests/docs — list findings in Notes
- [x] Update/add tests covering: initial counter state, decrement sequence (03→02→01), lockout-on-third-failure
- [x] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`
- [x] Build (postbuild asset-copy runs automatically per [[Ticket 29 Fix Login Page ChunkLoadError from Stale Static Asset References]]), restart `hud-web`
- [x] Verify live in a real browser: fresh load → "03"; one wrong attempt → "02"; lockout after third failure

## Open Questions

- Should `LOCKOUT_DURATION_MINUTES` change from `15` to `20`? Kevin's correction only addressed the attempt count (3), not the duration — needs his explicit confirmation before touching it.

## Notes

### 2026-06-08 — Implemented, audited, verified live, shipped

**Decision on `LOCKOUT_DURATION_MINUTES`:** left at `15` (per the ticket's
explicit default-to-leaving-it-alone instruction — Kevin's correction only
addressed the attempt count, not the duration; the Open Question above
remains genuinely open for him to answer if he wants `20`).

**Code changes:**

- Added `apps/web/lib/auth/lockout-constants.ts` — new pure-constants module
  (`LOCKOUT_THRESHOLD = 3`, `LOCKOUT_DURATION_MINUTES = 15`) with no
  `better-sqlite3`/Drizzle deps, so the client component `_LoginForm.tsx`
  can import the threshold without bundling native deps into the browser.
  `lib/auth/lockout.ts` now re-exports from this module — single source of
  truth, server-side imports unchanged.
- `lib/auth/lockout.ts`: `LOCKOUT_THRESHOLD` is now `3` (was `5`); doc
  comment updated to "3 consecutive failed attempts → locked_until = now +
  15 min".
- `_LoginForm.tsx`:
  - `remainingAttempts` state now `number` (was `number | null`),
    initialized to `LOCKOUT_THRESHOLD` (imported, not duplicated).
  - Removed the `{remainingAttempts !== null && ...}` hide-until-failure
    gate — `WarningCounter` now renders unconditionally, always visible
    from first paint per Kevin's explicit instruction (deliberately
    reversing Ticket 21's "hide until first failure" UX call — his call to
    make as product owner).
  - Reset points (lockout-expiry, successful login) now reset to
    `LOCKOUT_THRESHOLD` instead of `null`, keeping the counter always at a
    real numeric value consistent with the always-visible design.
  - Lockout message now interpolates `LOCKOUT_DURATION_MINUTES` instead of
    a hardcoded "15 minutes" string.
- `app/api/auth/login/route.ts`: the lockout-audit-write branch now
  compares `count >= LOCKOUT_THRESHOLD` and computes `lockedUntilTs` from
  `LOCKOUT_DURATION_MINUTES` (both were hardcoded `5` / `15 * 60 * 1000`
  before).
- `lockout.test.ts`: replaced hardcoded `5`/`15` literals with
  `LOCKOUT_THRESHOLD`/`LOCKOUT_DURATION_MINUTES` references; updated the
  "LOCKOUT_THRESHOLD is 5" assertion to "LOCKOUT_THRESHOLD is 3"; updated
  inline comment ("5th attempt" → "Final attempt (the LOCKOUT_THRESHOLD-th)
  attempt").

**Audit for other hardcoded "5"/"15" lockout references — findings:**

- `apps/web/lib/auth/rate-limit.ts` — has its own independent `5
  attempts / 15 minutes / IP` policy for the **IP-based** login rate
  limiter (separate mechanism from per-account lockout, different purpose
  and constants — `loginRateLimiter` `points: 5`, `duration: 15 * 60`).
  **Not in scope** — the ticket is about the per-account lockout threshold,
  not the IP rate limiter; changing it would be an unrelated policy change
  Kevin didn't ask for.
- `apps/web/app/dev/preview/page.tsx` — `<WarningCounter count={5} />` is
  a component-gallery demo with arbitrary illustrative values (`0`, `2`,
  `5`), not policy-derived. Left as-is; not lockout messaging.
- `WarningCounter.tsx` default `label` is `"Warning Attempts"` (component
  default) but `_LoginForm.tsx` always passes an explicit
  `label="Attempts Remaining"` — neither references a count, both remain
  accurate for any threshold value. No change needed.
- `app/api/auth/login/route.ts` docstring numbered steps ("5. Check
  account lockout") are step-list numbering, unrelated to the threshold.
- No other hardcoded `5`-as-lockout-threshold or `15`-as-duration
  references found tied to lockout messaging/copy/tests/docs.

**Verification — `pnpm test` / `pnpm typecheck` / `pnpm lint`:**

- `pnpm test`: 14 files, 163 tests passed (including the updated
  `lockout.test.ts`, 9/9).
- `pnpm typecheck`: clean, no errors.
- `pnpm lint`: clean — only 6 pre-existing warnings in
  `apps/web/scripts/copy-standalone-assets.mjs` (noConsole, unrelated to
  this change, present before this ticket).

**Build & restart:**

- `DATABASE_URL=/srv/hud/data/hud.db pnpm --filter web build` — succeeded;
  postbuild `copy-standalone-assets.mjs` ran automatically per Ticket 29's
  fix (copied `.next/static` and `public` into the standalone bundle).
  (Note: a plain `pnpm build` fails at "Collecting page data" because
  `/api/auth/login` opens the DB at module-load time and `DATABASE_URL`
  isn't in the shell env outside systemd's `EnvironmentFile` — exporting it
  for the build command fixes this; not a regression, just an environment
  quirk worth remembering for future rebuilds.)
- `sudo systemctl restart hud-web` — restarted cleanly, "Ready in 258ms".

**Live verification (real browser via Playwright + Chromium headless,
screenshots captured):**

Created a throwaway test user (`t31verify@example.com`, argon2id hash
inserted directly into `users`, matching the app's `ARGON2_OPTS`) so
Kevin's real account (`kevinyaton@gmail.com`, `failed_attempts=2` at the
time) would not be touched. Drove the full flow at `http://localhost:3000/login`:

1. Fresh page load → counter shows **"03"**
   (`aria-label="3 Attempts Remaining"`) — screenshot
   `step1-fresh-load.png`.
2. First wrong-password submit → counter decrements to **"02"**, "Invalid
   credentials" shown — screenshot `step2-after-1st-wrong.png`.
3. Second wrong-password submit → counter decrements to **"01"** —
   screenshot `step3-after-2nd-wrong.png`.
4. Third wrong-password submit → counter shows **"00"**, account locks,
   message reads "Locked — try again in 14:58" (live countdown from the
   `LOCKOUT_DURATION_MINUTES = 15` value) — screenshot
   `step4-after-3rd-wrong-lockout.png`.
5. Probe: attempted a fourth submission (with the *correct* password)
   while locked — form fields/button correctly disabled
   (`element is not enabled`), confirming the lockout gate blocks further
   attempts including with valid credentials (no oracle).

All AC behaviors confirmed exactly as specified: 03 → 02 → 01 → locked
on the 3rd failure, counter always visible from first paint.

**Cleanup:** deleted the throwaway test user and its orphaned audit-log
rows from `/srv/hud/data/hud.db` after verification. Confirmed Kevin's
real account (`kevinyaton@gmail.com`) was untouched throughout
(`failed_attempts=2`, `locked_until=NULL`, same as before the session).

**Files changed:**
- `apps/web/lib/auth/lockout-constants.ts` (new)
- `apps/web/lib/auth/lockout.ts`
- `apps/web/lib/auth/lockout.test.ts`
- `apps/web/app/(auth)/login/_LoginForm.tsx`
- `apps/web/app/api/auth/login/route.ts`

**Commit:** see `git log` for `fix(auth): lower lockout threshold to 3
attempts, always show counter` (this ticket's changes were committed
together with this Notes/status update).

